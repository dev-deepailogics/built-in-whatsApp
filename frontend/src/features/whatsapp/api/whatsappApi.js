import { API_BASE_URL } from "../../../shared/config/env.js";
import { apiRequest } from "../../../shared/api/httpClient.js";

export function getWhatsAppStatus() {
  return apiRequest("/api/status", {
    method: "GET"
  });
}

export function sendWhatsAppMessage({ phone, message }) {
  return apiRequest("/api/send-message", {
    method: "POST",
    body: JSON.stringify({ phone, message })
  });
}

export function reconnectWhatsApp() {
  return apiRequest("/api/reconnect", {
    method: "POST"
  });
}

export function logoutWhatsApp() {
  return apiRequest("/api/logout", {
    method: "POST"
  });
}

export function createWhatsAppEventSource() {
  return new EventSource(`${API_BASE_URL}/api/whatsapp-events`);
}
