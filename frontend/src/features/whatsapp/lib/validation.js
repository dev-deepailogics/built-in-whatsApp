import { MAX_MESSAGE_LENGTH } from "../constants.js";

export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

export function validateMessageForm({ phone, message }) {
  const errors = {};
  const digits = normalizePhoneDigits(phone);

  if (digits.length < 8 || digits.length > 15) {
    errors.phone = "Enter the phone number with country code, using 8-15 digits.";
  }

  if (!message.trim()) {
    errors.message = "Write a message before sending.";
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Keep the message under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`;
  }

  return errors;
}
