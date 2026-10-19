// Small shared helpers used across the backend.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Current UTC time as an ISO-8601 string (seconds precision), e.g. 2026-01-31T09:15:00+00:00 */
export function utcnowIso() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  );
}

/** Collapse runs of whitespace into single spaces and strip ends. */
export function normalizeWhitespace(text) {
  if (!text) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

export function isValidEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

export function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/** Safe integer parse used for query params. */
export function parseIntOr(value, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
