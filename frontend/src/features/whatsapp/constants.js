export const WHATSAPP_STATUS = {
  STARTING: "starting",
  QR: "qr",
  AUTHENTICATED: "authenticated",
  CONNECTED: "connected",
  AUTH_FAILURE: "auth_failure",
  DISCONNECTED: "disconnected",
  ERROR: "error"
};

export const MAX_MESSAGE_LENGTH = 4000;

export const INITIAL_WHATSAPP_STATE = {
  status: WHATSAPP_STATUS.STARTING,
  qr: null,
  message: "Connecting to backend...",
  lastUpdated: null
};
