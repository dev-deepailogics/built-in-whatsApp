import "dotenv/config";
import express from "express";
import cors from "cors";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

const app = express();
const PORT = Number(process.env.PORT || 5001);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || CLIENT_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;

const sseClients = new Set();

const whatsappState = {
  status: "starting",
  qr: null,
  message: "Starting WhatsApp client...",
  lastUpdated: new Date().toISOString()
};

app.use(
  cors({
    origin(origin, callback) {
      const isAllowedOrigin =
        !origin ||
        ALLOWED_ORIGINS.includes(origin) ||
        (process.env.NODE_ENV !== "production" && DEV_ORIGIN_PATTERN.test(origin));

      if (isAllowedOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json({ limit: "1mb" }));

let client = null;
let isClientInitializing = false;

function createWhatsAppClient() {
  const nextClient = new Client({
    authStrategy: new LocalAuth({
      clientId: process.env.WHATSAPP_CLIENT_ID || "personal-account",
      dataPath: process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth"
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ]
    }
  });

  attachWhatsAppListeners(nextClient);
  return nextClient;
}

function updateWhatsAppState(nextState) {
  Object.assign(whatsappState, nextState, {
    lastUpdated: new Date().toISOString()
  });

  broadcastEvent("whatsapp-state", whatsappState);
}

function broadcastEvent(event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const response of sseClients) {
    response.write(body);
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function formatPhoneForWhatsApp(phone) {
  const normalized = String(phone || "").replace(/[^\d]/g, "");

  if (!normalized || normalized.length < 8 || normalized.length > 15) {
    const error = new Error("Phone number must include country code and 8-15 digits.");
    error.statusCode = 400;
    throw error;
  }

  return `${normalized}@c.us`;
}

function getMessageId(messageResult) {
  return messageResult?.id?._serialized || messageResult?._data?.id?._serialized || null;
}

function attachWhatsAppListeners(whatsAppClient) {
  whatsAppClient.on("qr", async (qr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(qr, {
        margin: 2,
        width: 320,
        errorCorrectionLevel: "M"
      });

      updateWhatsAppState({
        status: "qr",
        qr: qrDataUrl,
        message: "Scan the QR code with WhatsApp to connect."
      });
    } catch (error) {
      updateWhatsAppState({
        status: "error",
        qr: null,
        message: "Failed to generate QR code."
      });
    }
  });

  whatsAppClient.on("authenticated", () => {
    updateWhatsAppState({
      status: "authenticated",
      qr: null,
      message: "WhatsApp authenticated. Preparing session..."
    });
  });

  whatsAppClient.on("ready", () => {
    updateWhatsAppState({
      status: "connected",
      qr: null,
      message: "Connected to WhatsApp."
    });
  });

  whatsAppClient.on("auth_failure", (message) => {
    updateWhatsAppState({
      status: "auth_failure",
      qr: null,
      message: message || "Authentication failed. Please scan a new QR code."
    });
  });

  whatsAppClient.on("disconnected", (reason) => {
    updateWhatsAppState({
      status: "disconnected",
      qr: null,
      message: reason || "WhatsApp disconnected. Use reconnect or clear session to generate a new QR."
    });
  });
}

async function initializeWhatsAppClient({ resetSession = false } = {}) {
  if (isClientInitializing) {
    return whatsappState;
  }

  isClientInitializing = true;

  updateWhatsAppState({
    status: "starting",
    qr: null,
    message: resetSession ? "Clearing WhatsApp session and generating a new QR..." : "Starting WhatsApp client..."
  });

  try {
    if (client) {
      if (resetSession) {
        await client.logout().catch(() => null);
      }

      await client.destroy().catch(() => null);
    }

    client = createWhatsAppClient();
    await client.initialize();
  } catch (error) {
    updateWhatsAppState({
      status: "error",
      qr: null,
      message: error.message || "Failed to initialize WhatsApp client."
    });
  } finally {
    isClientInitializing = false;
  }

  return whatsappState;
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    whatsapp: whatsappState.status,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.status(200).json(whatsappState);
});

app.post(
  "/api/reconnect",
  asyncHandler(async (req, res) => {
    const state = await initializeWhatsAppClient();

    res.status(202).json({
      success: true,
      state
    });
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (req, res) => {
    const state = await initializeWhatsAppClient({ resetSession: true });

    res.status(202).json({
      success: true,
      state
    });
  })
);

app.get("/api/whatsapp-events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`event: whatsapp-state\ndata: ${JSON.stringify(whatsappState)}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.post(
  "/api/send-message",
  asyncHandler(async (req, res) => {
    if (whatsappState.status !== "connected") {
      return res.status(409).json({
        success: false,
        error: "WhatsApp is not connected. Scan the QR code before sending messages."
      });
    }

    const { phone, message } = req.body || {};
    const text = String(message || "").trim();

    if (!text) {
      return res.status(400).json({
        success: false,
        error: "Message cannot be empty."
      });
    }

    if (text.length > Number(process.env.MAX_MESSAGE_LENGTH || 4000)) {
      return res.status(400).json({
        success: false,
        error: "Message is too long."
      });
    }

    if (!client) {
      return res.status(503).json({
        success: false,
        error: "WhatsApp client is not initialized. Reconnect and scan the QR code."
      });
    }

    const chatId = formatPhoneForWhatsApp(phone);
    const registeredNumber = await client.getNumberId(chatId).catch(() => null);

    if (!registeredNumber?._serialized) {
      return res.status(400).json({
        success: false,
        error: "This phone number is not registered on WhatsApp or cannot be reached."
      });
    }

    const result = await client.sendMessage(chatId, text);

    res.status(200).json({
      success: true,
      messageId: getMessageId(result),
      to: registeredNumber._serialized
    });
  })
);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 && isProduction ? "Internal server error." : error.message,
    ...(isProduction ? {} : { stack: error.stack })
  });
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });

  await initializeWhatsAppClient();
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  for (const response of sseClients) {
    response.end();
  }

  try {
    if (client) {
      await client.destroy();
    }
  } catch (error) {
    console.error("Failed to destroy WhatsApp client:", error.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
