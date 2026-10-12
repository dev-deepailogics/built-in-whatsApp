import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config/env.js";

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status || 0;
    this.payload = options.payload || null;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  const hasBody = options.body !== undefined && options.body !== null;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(payload.error || "Request failed.", {
        status: response.status,
        payload
      });
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("Request timed out. Check the backend and try again.");
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(error.message || "Network error. Check the backend and try again.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}
