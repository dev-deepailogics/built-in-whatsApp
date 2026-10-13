import { API_BASE_URL } from "../../../shared/config/env.js";
import { apiRequest } from "../../../shared/api/httpClient.js";

function sessionQuery(sessionId) {
  return `sessionId=${encodeURIComponent(sessionId)}`;
}

export function getWhatsAppStatus(sessionId) {
  return apiRequest(`/api/status?${sessionQuery(sessionId)}`, {
    method: "GET"
  });
}

export function sendWhatsAppMessage({ sessionId, phone, chatId, message }) {
  return apiRequest("/api/send-message", {
    method: "POST",
    body: JSON.stringify({ sessionId, phone, chatId, message })
  });
}

export function addWhatsAppContact({ sessionId, firstName, lastName, phone, syncToPhone }) {
  return apiRequest("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ sessionId, firstName, lastName, phone, syncToPhone }),
    timeoutMs: 30000
  });
}

export function getRecentChats({ sessionId, chatLimit = 10, messageLimit = 5 }) {
  const params = new URLSearchParams({
    sessionId,
    chatLimit: String(chatLimit),
    messageLimit: String(messageLimit)
  });

  return apiRequest(`/api/chats/recent?${params.toString()}`, {
    method: "GET",
    timeoutMs: 30000
  });
}

export function getChatMessages({ sessionId, chatId, limit = 20 }) {
  const params = new URLSearchParams({
    sessionId,
    chatId,
    limit: String(limit)
  });

  return apiRequest(`/api/chats/messages?${params.toString()}`, {
    method: "GET",
    timeoutMs: 30000
  });
}

export function getChatPhotoUrl({ sessionId, chatId }) {
  const params = new URLSearchParams({ sessionId, chatId });

  return `${API_BASE_URL}/api/chats/photo?${params.toString()}`;
}

export function syncChatHistory({ sessionId, chatId }) {
  return apiRequest(`/api/chats/sync-history?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "POST",
    body: JSON.stringify({ sessionId, chatId }),
    timeoutMs: 60000
  });
}

export function getMessageMedia({ sessionId, messageId }) {
  const params = new URLSearchParams({
    sessionId,
    messageId
  });

  return apiRequest(`/api/messages/media?${params.toString()}`, {
    method: "GET",
    timeoutMs: 45000
  });
}

export function reconnectWhatsApp(sessionId) {
  return apiRequest("/api/reconnect", {
    method: "POST",
    body: JSON.stringify({ sessionId })
  });
}

export function logoutWhatsApp(sessionId) {
  return apiRequest("/api/logout", {
    method: "POST",
    body: JSON.stringify({ sessionId })
  });
}

export function createWhatsAppEventSource(sessionId) {
  return new EventSource(`${API_BASE_URL}/api/whatsapp-events?${sessionQuery(sessionId)}`);
}

export function markChatSeen({ sessionId, chatId }) {
  return apiRequest(`/api/chats/seen?${sessionQuery(sessionId)}`, {
    method: "POST",
    body: JSON.stringify({ sessionId, chatId })
  });
}
