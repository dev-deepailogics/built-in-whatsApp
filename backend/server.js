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

const sessions = new Map();

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

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalizeSessionId(input) {
  const sessionId = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!sessionId || sessionId.length < 3 || sessionId.length > 64) {
    const error = new Error("sessionId must be 3-64 characters and may contain letters, numbers, dash, or underscore.");
    error.statusCode = 400;
    throw error;
  }

  return sessionId;
}

function getSessionId(req) {
  return normalizeSessionId(req.query.sessionId || req.body?.sessionId || req.headers["x-session-id"]);
}

function createInitialState(sessionId) {
  return {
    sessionId,
    status: "idle",
    qr: null,
    message: "WhatsApp client has not started yet.",
    lastUpdated: new Date().toISOString()
  };
}

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      client: null,
      isInitializing: false,
      state: createInitialState(sessionId),
      sseClients: new Set()
    });
  }

  return sessions.get(sessionId);
}

function updateSessionState(session, nextState) {
  Object.assign(session.state, nextState, {
    sessionId: session.sessionId,
    lastUpdated: new Date().toISOString()
  });

  broadcastSessionEvent(session, "whatsapp-state", session.state);
}

function broadcastSessionEvent(session, event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const response of session.sseClients) {
    response.write(body);
  }
}

function createWhatsAppClient(session) {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: session.sessionId,
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

  attachWhatsAppListeners(session, client);
  return client;
}

function attachWhatsAppListeners(session, client) {
  client.on("qr", async (qr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(qr, {
        margin: 2,
        width: 320,
        errorCorrectionLevel: "M"
      });

      updateSessionState(session, {
        status: "qr",
        qr: qrDataUrl,
        message: "Scan the QR code with this user's WhatsApp mobile app."
      });
    } catch (error) {
      updateSessionState(session, {
        status: "error",
        qr: null,
        message: "Failed to generate QR code."
      });
    }
  });

  client.on("authenticated", () => {
    updateSessionState(session, {
      status: "authenticated",
      qr: null,
      message: "WhatsApp authenticated. Preparing session..."
    });
  });

  client.on("ready", () => {
    updateSessionState(session, {
      status: "connected",
      qr: null,
      message: "Connected to WhatsApp."
    });
  });

  // message_create fires for incoming messages and for ones sent from this account (e.g. from the phone).
  client.on("message_create", async (message) => {
    try {
      if (message.from === "status@broadcast" || message.to === "status@broadcast") return;
      if (SYSTEM_MESSAGE_TYPES.includes(message.type)) return;

      const chatId = message.fromMe ? message.to : message.from;
      const payload = serializeMessage(message);

      if (!message.fromMe) {
        try {
          const contact = await message.getContact();
          const isBusiness = Boolean(contact?.isBusiness || contact?.isEnterprise);

          payload.sender = {
            id: message.author || message.from,
            name: contact?.name || contact?.shortName || contact?.pushname || contact?.verifiedName || null,
            number: contact?.number ? `+${contact.number}` : null,
            isBusiness
          };
        } catch (error) {
          // The UI falls back to a generic sender label.
        }
      }

      console.log(`[${session.sessionId}] message ${payload.id} in ${chatId} -> ${session.sseClients.size} listener(s)`);
      broadcastSessionEvent(session, "whatsapp-message", { chatId, message: payload });
    } catch (error) {
      console.error(`Failed to broadcast message for ${session.sessionId}:`, error.message);
    }
  });

  client.on("auth_failure", (message) => {
    updateSessionState(session, {
      status: "auth_failure",
      qr: null,
      message: message || "Authentication failed. Generate a new QR code."
    });
  });

  client.on("disconnected", (reason) => {
    updateSessionState(session, {
      status: "disconnected",
      qr: null,
      message: reason || "WhatsApp disconnected. Reconnect or generate a new QR."
    });

    // Release the Chromium process; /api/reconnect creates a fresh client.
    client.destroy().catch(() => null);
  });

  // Push read-state changes (e.g. chat read on the phone) so badges stay in sync without polling.
  client.on("unread_count", (chat) => {
    const chatId = chat?.id?._serialized;

    if (chatId) {
      broadcastSessionEvent(session, "whatsapp-unread", { chatId, unreadCount: chat.unreadCount || 0 });
    }
  });
}

async function initializeSession(session, { resetSession = false } = {}) {
  if (session.isInitializing) {
    return session.state;
  }

  session.isInitializing = true;

  updateSessionState(session, {
    status: "starting",
    qr: null,
    message: resetSession ? "Clearing saved session and generating a new QR..." : "Starting WhatsApp client..."
  });

  try {
    if (session.client) {
      if (resetSession) {
        await session.client.logout().catch(() => null);
      }

      await session.client.destroy().catch(() => null);
    }

    session.client = createWhatsAppClient(session);
    await session.client.initialize();
  } catch (error) {
    updateSessionState(session, {
      status: "error",
      qr: null,
      message: error.message || "Failed to initialize WhatsApp client."
    });
  } finally {
    session.isInitializing = false;
  }

  return session.state;
}

function normalizePhoneDigits(phone) {
  const normalized = String(phone || "").replace(/[^\d]/g, "");

  if (!normalized || normalized.length < 8 || normalized.length > 15) {
    const error = new Error("Phone number must include country code and 8-15 digits.");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

const SEND_WINDOW_MS = 60 * 1000;
const SEND_MAX_PER_WINDOW = Number(process.env.SEND_MAX_PER_MINUTE || 30);
const sendTimestamps = new Map();

function getMessageId(messageResult) {
  return messageResult?.id?._serialized || messageResult?._data?.id?._serialized || null;
}

function getBoundedNumber(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function serializeMessage(message) {
  return {
    id: message.id?._serialized || null,
    body: message.body || "",
    type: message.type || "unknown",
    timestamp: message.timestamp || null,
    fromMe: Boolean(message.fromMe),
    from: message.from || null,
    to: message.to || null,
    author: message.author || null,
    hasMedia: Boolean(message.hasMedia),
    mimetype: message._data?.mimetype || null,
    filename: message._data?.filename || null,
    duration: message.duration || message._data?.duration || null,
    callOutcome: message._data?.callOutcome || message._data?.subtype || null,
    isVideoCall: Boolean(message._data?.isVideoCall),
    callDuration: message._data?.callDuration || null
  };
}

// Encryption/system notices (e.g. "security code changed") carry no content worth showing.
const SYSTEM_MESSAGE_TYPES = ["e2e_notification", "notification", "notification_template", "gp2", "protocol", "broadcast_notification"];

async function getRecentChatsFromBrowser(client, { chatLimit, messageLimit }) {
  return client.pupPage.evaluate(
    ({ chatLimit: pageChatLimit, messageLimit: pageMessageLimit, systemTypes: pageSystemTypes }) => {
      const getSerializedId = (value) => {
        if (!value) return null;
        if (typeof value === "string") return value;
        if (value._serialized) return value._serialized;
        if (typeof value.toString === "function") return value.toString();
        return null;
      };

      const serializeMessageModel = (message) => {
        try {
          const raw = typeof message.serialize === "function" ? message.serialize() : message;
          const id = raw.id || message.id || {};
          const type = raw.type || message.type || "unknown";
          const hasMedia = Boolean(raw.directPath || raw.mediaKey || message.mediaKey);

          return {
            id: getSerializedId(id),
            body: hasMedia ? raw.caption || "" : raw.body || raw.pollName || raw.eventName || "",
            type,
            timestamp: raw.t || message.t || null,
            fromMe: Boolean(id.fromMe || raw.fromMe),
            from: getSerializedId(raw.from || message.from),
            to: getSerializedId(raw.to || message.to),
            author: getSerializedId(raw.author || message.author),
            hasMedia,
            mimetype: raw.mimetype || message.mimetype || null,
            filename: raw.filename || message.filename || null,
            duration: raw.duration || message.duration || null,
            callOutcome: raw.callOutcome || raw.subtype || message.subtype || null,
            isVideoCall: Boolean(raw.isVideoCall ?? message.isVideoCall),
            callDuration: raw.callDuration || message.callDuration || null
          };
        } catch (error) {
          return null;
        }
      };

      const serializeChatModel = (chat) => {
        try {
          const raw = typeof chat.serialize === "function" ? chat.serialize() : chat;
          const id = getSerializedId(raw.id || chat.id);

          if (!id) return null;

          const messageModels = chat.msgs?.getModelsArray?.() || [];
          const messages = messageModels
            .filter((message) => !message.isNotification && !pageSystemTypes.includes(message.type))
            .sort((a, b) => (a.t || 0) - (b.t || 0))
            .slice(-pageMessageLimit)
            .map(serializeMessageModel)
            .filter(Boolean);

          const contact = chat.contact || raw.contact || {};
          const isBusiness = Boolean(contact.isBusiness || contact.isEnterprise);
          const businessName = isBusiness ? contact.verifiedName || contact.pushname || null : null;
          const title = chat.formattedTitle || raw.formattedTitle || raw.name || raw.contact?.name || id;

          return {
            id,
            // Keep the user's saved contact name; fall back to the business name when the title is only a number.
            name: businessName && /^[+\d\s()-]+$/.test(String(title)) ? businessName : title,
            phoneTitle: title,
            isBusiness,
            businessName,
            phone: (() => {
              const phoneId = getSerializedId(contact.phoneNumber) || (id.endsWith("@c.us") ? id : "");
              const idDigits = phoneId.split("@")[0];

              if (/^\d{8,15}$/.test(idDigits) && /@c\.us$/.test(phoneId)) return `+${idDigits}`;

              // Unsaved contacts are titled with their formatted number, e.g. "+92 321 4444537".
              const titleDigits = String(title).replace(/[\s()-]/g, "");
              return /^\+\d{8,15}$/.test(titleDigits) ? titleDigits : null;
            })(),
            isGroup: Boolean(raw.isGroup || chat.groupMetadata),
            unreadCount: raw.unreadCount || chat.unreadCount || 0,
            timestamp: raw.t || chat.t || messages.at(-1)?.timestamp || null,
            lastMessage: messages.at(-1) || null,
            messages
          };
        } catch (error) {
          return null;
        }
      };

      // Order and trim the raw models first so only the requested page is serialized, not every chat.
      const chatCollection = window.require("WAWebCollections").Chat;
      return chatCollection
        .getModelsArray()
        .sort((a, b) => (b.t || 0) - (a.t || 0))
        .slice(0, pageChatLimit)
        .map(serializeChatModel)
        .filter(Boolean)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    },
    { chatLimit, messageLimit, systemTypes: SYSTEM_MESSAGE_TYPES }
  );
}

async function getChatMessages(session, { chatId, limit }) {
  return session.client.pupPage.evaluate(
    async ({ requestedChatId, requestedLimit, requestedSystemTypes }) => {
      const getSerializedId = (value) => {
        if (!value) return null;
        if (typeof value === "string") return value;
        if (value._serialized) return value._serialized;
        if (typeof value.toString === "function") return value.toString();
        return null;
      };

      const serializeMessageModel = (message) => {
        try {
          const raw = typeof message.serialize === "function" ? message.serialize() : message;
          const id = raw.id || message.id || {};
          const type = raw.type || message.type || "unknown";
          const hasMedia = Boolean(raw.directPath || raw.mediaKey || message.mediaKey);

          return {
            id: getSerializedId(id),
            body: hasMedia ? raw.caption || "" : raw.body || raw.pollName || raw.eventName || "",
            type,
            timestamp: raw.t || message.t || null,
            fromMe: Boolean(id.fromMe || raw.fromMe),
            from: getSerializedId(raw.from || message.from),
            to: getSerializedId(raw.to || message.to),
            author: getSerializedId(raw.author || message.author),
            hasMedia,
            mimetype: raw.mimetype || message.mimetype || null,
            filename: raw.filename || message.filename || null,
            duration: raw.duration || message.duration || null,
            callOutcome: raw.callOutcome || raw.subtype || message.subtype || null,
            isVideoCall: Boolean(raw.isVideoCall ?? message.isVideoCall),
            callDuration: raw.callDuration || message.callDuration || null
          };
        } catch (error) {
          return null;
        }
      };

      const chatCollection = window.require("WAWebCollections").Chat;
      const chat = chatCollection
        .getModelsArray()
        .find((candidate) => getSerializedId(candidate.id) === requestedChatId || getSerializedId(candidate.__x_id) === requestedChatId);

      if (!chat) {
        return { found: false, messages: [] };
      }

      const msgFilter = (message) => !message.isNotification && !requestedSystemTypes.includes(message.type);
      let messages = (chat.msgs?.getModelsArray?.() || []).filter(msgFilter);

      while (messages.length < requestedLimit) {
        const loadedMessages = await window.require("WAWebChatLoadMessages").loadEarlierMsgs({ chat }).catch(() => []);
        if (!loadedMessages?.length) break;
        messages = [...loadedMessages.filter(msgFilter), ...messages];
      }

      messages = messages
        .sort((a, b) => (a.t || 0) - (b.t || 0))
        .slice(-requestedLimit)
        .map(serializeMessageModel)
        .filter(Boolean);

      const collections = window.require("WAWebCollections");
      const senderCache = new Map();

      const resolveSender = (senderId) => {
        if (!senderId) return null;
        if (senderCache.has(senderId)) return senderCache.get(senderId);

        let sender = { id: senderId, name: null, number: null, isBusiness: false };

        try {
          const contact = collections.Contact.get(senderId);
          const phoneId = getSerializedId(contact?.phoneNumber) || senderId;
          const user = String(phoneId).split("@")[0];
          const isBusiness = Boolean(contact?.isBusiness || contact?.isEnterprise);

          sender = {
            id: senderId,
            // Saved name wins, then business/verified name, then the sender's own WhatsApp profile name.
            name:
              contact?.name ||
              contact?.shortName ||
              (isBusiness ? contact?.verifiedName : null) ||
              contact?.pushname ||
              contact?.verifiedName ||
              null,
            number: /@(c\.us|s\.whatsapp\.net)$/.test(phoneId) && /^\d+$/.test(user) ? `+${user}` : null,
            isBusiness
          };
        } catch (error) {
          // Leave the unresolved sender; the UI falls back to a generic label.
        }

        senderCache.set(senderId, sender);
        return sender;
      };

      for (const message of messages) {
        if (message.fromMe) continue;

        const sender = resolveSender(message.author || message.from);

        if (sender) {
          message.sender = sender;
        }
      }

      return { found: true, messages };
    },
    { requestedChatId: chatId, requestedLimit: limit, requestedSystemTypes: SYSTEM_MESSAGE_TYPES }
  );
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

app.get(
  "/api/status",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status === "idle") {
      initializeSession(session).catch(() => null);
    }

    res.status(200).json(session.state);
  })
);

app.post(
  "/api/reconnect",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));
    const state = await initializeSession(session);

    res.status(202).json({
      success: true,
      state
    });
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));
    const state = await initializeSession(session, { resetSession: true });

    res.status(202).json({
      success: true,
      state
    });
  })
);

app.get(
  "/api/whatsapp-events",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    session.sseClients.add(res);
    res.write(`event: whatsapp-state\ndata: ${JSON.stringify(session.state)}\n\n`);

    if (session.state.status === "idle") {
      initializeSession(session).catch(() => null);
    }

    const heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      session.sseClients.delete(res);
    });
  })
);

app.post(
  "/api/send-message",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status !== "connected") {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before sending messages."
      });
    }

    if (!session.client) {
      return res.status(503).json({
        success: false,
        error: "WhatsApp client is not initialized. Reconnect and scan the QR code."
      });
    }

    const { phone, message } = req.body || {};
    const text = String(message || "").trim();

    // WhatsApp flags bursts of automated sends; keep each session to a human-plausible rate.
    const nowMs = Date.now();
    const recentSends = (sendTimestamps.get(session.sessionId) || []).filter((at) => nowMs - at < SEND_WINDOW_MS);

    if (recentSends.length >= SEND_MAX_PER_WINDOW) {
      return res.status(429).json({
        success: false,
        error: "Sending too fast. Please wait a moment before sending more messages."
      });
    }

    recentSends.push(nowMs);
    sendTimestamps.set(session.sessionId, recentSends);

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

    const existingChatId = String(req.body?.chatId || "").trim();
    let recipientId = null;

    if (existingChatId) {
      if (!/^[\w.-]+@(c\.us|g\.us|lid)$/.test(existingChatId)) {
        return res.status(400).json({
          success: false,
          error: "chatId is not a valid WhatsApp chat id."
        });
      }

      recipientId = existingChatId;
    } else {
      const registeredNumber = await session.client.getNumberId(normalizePhoneDigits(phone)).catch(() => null);

      if (!registeredNumber?._serialized) {
        return res.status(400).json({
          success: false,
          error: "This phone number is not registered on WhatsApp or cannot be reached."
        });
      }

      recipientId = registeredNumber._serialized;
    }

    const result = await session.client.sendMessage(recipientId, text);

    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      messageId: getMessageId(result),
      to: recipientId
    });
  })
);

app.get(
  "/api/chats/recent",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before reading chat history."
      });
    }

    const chatLimit = getBoundedNumber(req.query.chatLimit, 10, { min: 1, max: 500 });
    const messageLimit = getBoundedNumber(req.query.messageLimit, 5, { min: 1, max: 25 });
    let serializedChats = [];

    try {
      serializedChats = await getRecentChatsFromBrowser(session.client, { chatLimit, messageLimit });
    } catch (error) {
      console.error(`Failed to load recent chats for ${session.sessionId}:`, error.message);

      return res.status(503).json({
        success: false,
        error: "Could not load WhatsApp chat history right now. Keep WhatsApp connected and try again."
      });
    }

    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      chatLimit,
      messageLimit,
      chats: serializedChats
    });
  })
);

app.post(
  "/api/chats/seen",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));
    const chatId = String(req.body?.chatId || "").trim();

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({ success: false, error: "WhatsApp is not connected." });
    }

    if (!/^[\w.-]+@(c\.us|g\.us|lid)$/.test(chatId)) {
      return res.status(400).json({ success: false, error: "chatId is not a valid WhatsApp chat id." });
    }

    await session.client.sendSeen(chatId);
    res.status(200).json({ success: true });
  })
);

app.get(
  "/api/chats/messages",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before reading messages."
      });
    }

    const chatId = String(req.query.chatId || "").trim();

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: "chatId is required."
      });
    }

    const limit = getBoundedNumber(req.query.limit, 20, { min: 1, max: 200 });
    const result = await getChatMessages(session, { chatId, limit });

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: "Chat not found in the current WhatsApp session."
      });
    }

    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      chatId,
      limit,
      messages: result.messages
    });
  })
);

// Small byte-bounded LRU so reopening a chat does not re-download and re-decrypt the same media.
const MEDIA_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const mediaCache = new Map();
let mediaCacheBytes = 0;

function mediaCacheGet(key) {
  const entry = mediaCache.get(key);
  if (!entry) return null;

  mediaCache.delete(key);
  mediaCache.set(key, entry);
  return entry.payload;
}

function mediaCacheSet(key, payload) {
  const size = payload.dataUrl.length;
  if (size > MEDIA_CACHE_MAX_BYTES / 2) return;

  mediaCache.set(key, { payload, size });
  mediaCacheBytes += size;

  for (const [oldKey, oldEntry] of mediaCache) {
    if (mediaCacheBytes <= MEDIA_CACHE_MAX_BYTES) break;
    mediaCache.delete(oldKey);
    mediaCacheBytes -= oldEntry.size;
  }
}

async function downloadMessageMedia(client, messageId) {
  try {
    const result = await client.pupPage.evaluate(async (msgId) => {
      const collections = window.require("WAWebCollections");
      const msg =
        collections.Msg.get(msgId) || (await collections.Msg.getMessagesById([msgId]))?.messages?.[0];

      if (!msg || !msg.mediaData) {
        return { failure: { step: "lookup", found: Boolean(msg) } };
      }

      const stageBefore = msg.mediaData.mediaStage;

      if (stageBefore !== "RESOLVED") {
        try {
          await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
        } catch (error) {
          // Fall through: the direct download below may still succeed.
        }
      }

      const mockQpl = {
        addAnnotations() {
          return this;
        },
        addPoint() {
          return this;
        }
      };
      const manager = window.require("WAWebDownloadManager").downloadManager;
      // Typed downloads (audio, image, video...) are rejected by the manager's mimetype check when the CDN serves octet-stream; "document" skips it.
      const typeCandidates = msg.type === "document" ? [msg.type] : [msg.type, "document"];
      let lastError = null;

      for (const type of typeCandidates) {
        try {
          const decrypted = await manager.downloadAndMaybeDecrypt({
            directPath: msg.directPath,
            encFilehash: msg.encFilehash,
            filehash: msg.filehash,
            mediaKey: msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type,
            signal: new AbortController().signal,
            downloadQpl: mockQpl
          });
          const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);

          return {
            media: { data, mimetype: msg.mimetype, filename: msg.filename, filesize: msg.size }
          };
        } catch (error) {
          lastError = error;
        }
      }

      return {
        failure: {
          step: "download",
          stageBefore,
          stageAfter: msg.mediaData.mediaStage,
          status: lastError?.status ?? null,
          message: String(lastError?.message ?? lastError)
        }
      };
    }, messageId);

    return { media: result.media || null, failure: result.failure || null };
  } catch (error) {
    return { media: null, failure: { step: "evaluate", message: error.message } };
  }
}

app.post(
  "/api/contacts",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before adding contacts."
      });
    }

    const { firstName, lastName, phone, syncToPhone } = req.body || {};
    const digits = String(phone || "").replace(/\D/g, "");
    const first = String(firstName || "").trim();

    if (!first) {
      return res.status(400).json({ success: false, error: "Contact name is required." });
    }

    if (digits.length < 8 || digits.length > 15) {
      return res.status(400).json({
        success: false,
        error: "Enter the phone number with country code, using 8-15 digits."
      });
    }

    const registered = await session.client.getNumberId(digits).catch(() => null);

    if (!registered?._serialized) {
      return res.status(400).json({
        success: false,
        error: "This phone number is not registered on WhatsApp."
      });
    }

    await session.client.saveOrEditAddressbookContact(
      digits,
      first,
      String(lastName || "").trim(),
      Boolean(syncToPhone)
    );

    res.status(201).json({
      success: true,
      contact: {
        id: registered._serialized,
        name: [first, String(lastName || "").trim()].filter(Boolean).join(" "),
        phone: `+${digits}`,
        syncedToPhone: Boolean(syncToPhone)
      }
    });
  })
);

app.post(
  "/api/chats/sync-history",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));
    const chatId = String(req.body?.chatId || "").trim();

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before syncing history."
      });
    }

    if (!/^[\w.-]+@(c\.us|g\.us|lid)$/.test(chatId)) {
      return res.status(400).json({ success: false, error: "chatId is not a valid WhatsApp chat id." });
    }

    // WhatsApp temporarily disables on-demand sync after repeated failures, so avoid hammering it.
    const attemptKey = `${session.sessionId}:${chatId}`;
    const lastAttemptAt = historySyncAttempts.get(attemptKey) || 0;
    const waitMs = HISTORY_SYNC_COOLDOWN_MS - (Date.now() - lastAttemptAt);

    if (waitMs > 0) {
      return res.status(429).json({
        success: false,
        error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting older messages again.`
      });
    }

    historySyncAttempts.set(attemptKey, Date.now());

    const before = await countLocalChatMessages(session.client, chatId);
    const requested = await session.client.syncHistory(chatId);

    if (!requested) {
      // WhatsApp reports no more history on the phone for this chat (or the chat is unknown).
      return res.status(200).json({ success: true, requested: false, added: 0, total: before });
    }

    // The phone answers asynchronously; wait until the local count grows and then stops changing.
    const deadline = Date.now() + HISTORY_SYNC_MAX_WAIT_MS;
    let latest = before;
    let stableTicks = 0;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, HISTORY_SYNC_POLL_INTERVAL_MS));

      const current = await countLocalChatMessages(session.client, chatId);
      stableTicks = current === latest ? stableTicks + 1 : 0;
      latest = current;

      if (latest > before && stableTicks >= 2) break;
    }

    res.status(200).json({
      success: true,
      requested: true,
      added: Math.max(latest - before, 0),
      total: latest
    });
  })
);

const PROFILE_PHOTO_TTL_MS = 60 * 60 * 1000;
const PROFILE_PHOTO_CACHE_MAX_ENTRIES = 500;
const profilePhotoCache = new Map();
const profilePhotoInFlight = new Map();

app.get(
  "/api/chats/photo",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));
    const chatId = String(req.query.chatId || "").trim();

    if (!chatId) {
      return res.status(400).json({ success: false, error: "chatId is required." });
    }

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({ success: false, error: "WhatsApp is not connected." });
    }

    const cacheKey = `${session.sessionId}:${chatId}`;
    let entry = profilePhotoCache.get(cacheKey);

    if (!entry || Date.now() - entry.fetchedAt > PROFILE_PHOTO_TTL_MS) {
      // The chat list, thread header and group senders all ask for the same photo at once; share one lookup.
      if (!profilePhotoInFlight.has(cacheKey)) {
        profilePhotoInFlight.set(
          cacheKey,
          fetchProfilePhoto(session, chatId).finally(() => profilePhotoInFlight.delete(cacheKey))
        );
      }

      entry = await profilePhotoInFlight.get(cacheKey);
      profilePhotoCache.delete(cacheKey);
      profilePhotoCache.set(cacheKey, entry);

      if (profilePhotoCache.size > PROFILE_PHOTO_CACHE_MAX_ENTRIES) {
        profilePhotoCache.delete(profilePhotoCache.keys().next().value);
      }
    }

    if (!entry.image) {
      return res.status(404).json({ success: false, error: "No profile photo." });
    }

    res.set("Content-Type", entry.image.contentType);
    res.set("Cache-Control", "private, max-age=3600");
    res.send(entry.image.buffer);
  })
);

async function fetchProfilePhoto(session, chatId) {
  const entry = { fetchedAt: Date.now(), image: null };

  try {
    // whatsapp-web.js's getProfilePicUrl() fails on this WhatsApp Web build; call the bridge directly.
    const photoUrl = await session.client.pupPage.evaluate(async (id) => {
      const collections = window.require("WAWebCollections");
      const chat = collections.Chat.get(id) || collections.Contact.get(id);

      if (!chat) return null;

      try {
        const pic = await window.require("WAWebContactProfilePicThumbBridge").requestProfilePicFromServer(chat);
        return pic?.eurl || null;
      } catch (error) {
        return null;
      }
    }, chatId);

    if (photoUrl) {
      const photoResponse = await fetch(photoUrl);

      if (photoResponse.ok) {
        entry.image = {
          contentType: photoResponse.headers.get("content-type") || "image/jpeg",
          buffer: Buffer.from(await photoResponse.arrayBuffer())
        };
      }
    }
  } catch (error) {
    console.error(`Profile photo lookup failed for ${chatId}:`, error.message);
  }

  return entry;
}

const HISTORY_SYNC_COOLDOWN_MS = 15 * 1000;
const HISTORY_SYNC_POLL_INTERVAL_MS = 1500;
const HISTORY_SYNC_MAX_WAIT_MS = 25 * 1000;
const historySyncAttempts = new Map();

async function countLocalChatMessages(client, chatId) {
  return client.pupPage.evaluate((requestedChatId, systemTypes) => {
    const chat = window
      .require("WAWebCollections")
      .Chat.getModelsArray()
      .find((candidate) => {
        const id = candidate.id?._serialized || candidate.id?.toString?.();
        return id === requestedChatId;
      });

    return (chat?.msgs?.getModelsArray?.() || []).filter((message) => !message.isNotification && !systemTypes.includes(message.type)).length;
  }, chatId, SYSTEM_MESSAGE_TYPES);
}

app.get(
  "/api/messages/media",
  asyncHandler(async (req, res) => {
    const session = getOrCreateSession(getSessionId(req));

    if (session.state.status !== "connected" || !session.client) {
      return res.status(409).json({
        success: false,
        error: "This user's WhatsApp is not connected. Scan the QR code before loading media."
      });
    }

    const messageId = String(req.query.messageId || "").trim();

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: "messageId is required."
      });
    }

    const cacheKey = `${session.sessionId}:${messageId}`;
    const cached = mediaCacheGet(cacheKey);

    if (cached) {
      res.set("Cache-Control", "private, max-age=3600");
      return res.status(200).json(cached);
    }

    let media = null;
    let downloadFailure = null;

    // Own download path: whatsapp-web.js swallows details and collapses most failures into opaque errors.
    for (let attempt = 0; attempt < 2 && !media?.data; attempt += 1) {
      const result = await downloadMessageMedia(session.client, messageId);
      media = result.media;
      downloadFailure = result.failure;

      if (!media?.data) {
        console.error(`Media download failed for ${messageId} (attempt ${attempt + 1}):`, JSON.stringify(downloadFailure));
      }
    }

    if (!media?.data) {
      return res.status(404).json({
        success: false,
        error: "Media is not available from WhatsApp right now.",
        ...(process.env.NODE_ENV === "production" ? {} : { details: downloadFailure })
      });
    }

    const payload = {
      success: true,
      messageId,
      mimetype: media.mimetype,
      filename: media.filename || null,
      filesize: media.filesize || null,
      dataUrl: `data:${String(media.mimetype).replace(/;\s+/g, ";")};base64,${media.data}`
    };

    mediaCacheSet(cacheKey, payload);
    res.set("Cache-Control", "private, max-age=3600");
    res.status(200).json(payload);
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
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  for (const session of sessions.values()) {
    for (const response of session.sseClients) {
      response.end();
    }

    try {
      await session.client?.destroy();
    } catch (error) {
      console.error(`Failed to destroy WhatsApp client for ${session.sessionId}:`, error.message);
    }
  }

  process.exit(0);
}

// Puppeteer rejects with "Execution context was destroyed" during page navigations; log instead of crashing every session.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason?.message || reason);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
