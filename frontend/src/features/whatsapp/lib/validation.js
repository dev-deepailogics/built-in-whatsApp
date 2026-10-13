export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}
