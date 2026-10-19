// Signed-cookie session, mirroring the old Flask session model:
//   - payload JSON is base64url-encoded along with an HMAC-SHA256 signature
//   - cookies are httpOnly + SameSite=Lax
//   - a CSRF token lives in the session and is enforced via the X-CSRF-Token
//     header on authenticated, state-changing requests.
import crypto from "node:crypto";

const COOKIE_NAME = "hiresense_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function sessionMiddleware(secret, { secure = false } = {}) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    let data = {};

    const raw = cookies[COOKIE_NAME];
    if (raw) {
      const dot = raw.lastIndexOf(".");
      if (dot > 0) {
        const payload = raw.slice(0, dot);
        const signature = raw.slice(dot + 1);
        const expected = sign(payload, secret);
        if (
          expected.length === signature.length &&
          crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
        ) {
          try {
            data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
          } catch {
            data = {};
          }
        }
      }
    }

    const initial = JSON.stringify(data);
    let persisted = false;

    // Persist the session cookie right before headers are written, so the
    // Set-Cookie header is always included when the session changed.
    function persist() {
      if (persisted) return;
      persisted = true;
      if (JSON.stringify(data) === initial) return;
      if (Object.keys(data).length === 0) {
        res.clearCookie(COOKIE_NAME, { path: "/" });
      } else {
        const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
        res.cookie(COOKIE_NAME, `${payload}.${sign(payload, secret)}`, {
          httpOnly: true,
          sameSite: "lax",
          secure,
          maxAge: MAX_AGE_SECONDS * 1000,
          path: "/",
        });
      }
    }

    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function patchedWriteHead(statusCode, ...args) {
      persist();
      return origWriteHead(statusCode, ...args);
    };

    req.session = {
      get data() {
        return data;
      },
      set(key, value) {
        data[key] = value;
      },
      delete(key) {
        delete data[key];
      },
      clear() {
        data = {};
      },
    };

    next();
  };
}

// --- CSRF helpers (same header contract as before) ---

export const CSRF_HEADER = "x-csrf-token";

/** Return the session's CSRF token, generating one if needed. */
export function ensureCsrfToken(req) {
  let token = req.session.data.csrf_token;
  if (!token) {
    token = crypto.randomBytes(32).toString("base64url");
    req.session.set("csrf_token", token);
  }
  return token;
}

/**
 * Enforce CSRF tokens on authenticated, unsafe requests.
 * Returns an error message string, or null when the request may proceed.
 */
export function csrfProtect(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return null;
  // Login is exempt so a signed-in user can re-authenticate without a token;
  // the session cookie itself is SameSite=Lax, which blocks cross-site POSTs.
  if (req.path === "/api/auth/login") return null;
  // Public candidate endpoints never act on session privileges, so they must
  // keep working even when a recruiter happens to be signed in on the same
  // browser. They are protected by rate limiting instead.
  if (req.path.startsWith("/api/public/")) return null;
  if (!req.session.data.recruiter_id) return null;
  const expected = req.session.data.csrf_token;
  if (!expected) return null;
  const provided = String(req.headers[CSRF_HEADER] || "");
  if (!provided) return "Invalid or missing CSRF token. Please retry.";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return "Invalid or missing CSRF token. Please retry.";
  }
  return null;
}
