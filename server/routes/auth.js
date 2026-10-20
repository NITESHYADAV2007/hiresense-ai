// Authentication endpoints: login, logout, me, change-password, CSRF token.
import bcrypt from "bcryptjs";
import { getDb, rowToDict } from "../db.js";
import { currentRecruiter, loginRequired, startRecruiterSession } from "../auth.js";
import { ensureCsrfToken } from "../session.js";
import { ensureSettings } from "../services/application.js";
import { isValidEmail, utcnowIso } from "../utils/helpers.js";
import { RateLimiter } from "../utils/rate_limit.js";
import { success, fail } from "../utils/responses.js";
import { requireString, validatePassword } from "../utils/validators.js";

// 10 failed attempts per 15 minutes per (ip, email) key.
const loginLimiter = new RateLimiter(10, 900);
// Recruiter self-signup is intentionally limited even when enabled.
const registerLimiter = new RateLimiter(10, 3600);

// Constant-work comparison target so timing does not reveal whether an email exists.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 10);

function clientKey(req, email) {
  return `${req.ip}|${email}`.toLowerCase();
}

function isJson(req) {
  return req.is("application/json") === "application/json";
}

function publicRecruiter(req, recruiter) {
  return {
    id: recruiter.id,
    name: recruiter.name,
    email: recruiter.email,
    csrf_token: ensureCsrfToken(req),
  };
}

export function authRoutes(app) {
  app.post("/api/auth/login", (req, res) => {
    if (!isJson(req)) return fail(res, "Request body must be JSON.");
    const data = req.body || {};

    const [email, err] = requireString(data, "email", { maxLength: 254 });
    if (err) return fail(res, err);
    const password = data.password;
    if (typeof password !== "string" || password === "") {
      return fail(res, "'password' is required.");
    }
    if (!isValidEmail(email)) return fail(res, "A valid email address is required.");

    const key = clientKey(req, email);
    const [allowed, retryAfter] = loginLimiter.check(key);
    if (!allowed) {
      return fail(res, `Too many login attempts. Try again in ${retryAfter} seconds.`, 429);
    }

    const db = getDb();
    const row = db.prepare("SELECT * FROM recruiters WHERE email = ?").get(email.toLowerCase());

    // Always run a hash comparison to avoid leaking which emails exist.
    let passwordOk = false;
    if (row !== undefined && row !== null) {
      passwordOk = bcrypt.compareSync(password, row.password_hash);
    } else {
      bcrypt.compareSync(password, DUMMY_HASH);
    }

    if (row === undefined || row === null || !passwordOk) {
      loginLimiter.hit(key);
      return fail(res, "Incorrect email or password.", 401);
    }

    loginLimiter.reset(key);
    const recruiter = rowToDict(row);
    const csrfToken = startRecruiterSession(req, recruiter);
    ensureSettings(recruiter.id);

    return success(res, {
      id: recruiter.id,
      name: recruiter.name,
      email: recruiter.email,
      csrf_token: csrfToken,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.clear();
    return success(res, { message: "Signed out." });
  });

  app.get("/api/auth/me", (req, res) => {
    const recruiter = currentRecruiter(req);
    if (recruiter === null) return fail(res, "Not authenticated.", 401);
    return success(res, publicRecruiter(req, recruiter));
  });

  app.get("/api/auth/csrf", (req, res) => {
    return success(res, { csrf_token: ensureCsrfToken(req) });
  });

  app.post("/api/auth/change-password", loginRequired, (req, res) => {
    if (!isJson(req)) return fail(res, "Request body must be JSON.");
    const data = req.body || {};

    const currentPassword = data.current_password;
    const newPassword = data.new_password;
    if (typeof currentPassword !== "string" || currentPassword === "") {
      return fail(res, "'current_password' is required.");
    }
    const pwErr = validatePassword(newPassword);
    if (pwErr) return fail(res, pwErr);

    const db = getDb();
    const row = db
      .prepare("SELECT password_hash FROM recruiters WHERE id = ?")
      .get(req.session.data.recruiter_id);
    if (row === undefined || row === null || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      return fail(res, "Your current password is incorrect.", 401);
    }

    db.prepare("UPDATE recruiters SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      bcrypt.hashSync(newPassword, 10),
      utcnowIso(),
      req.session.data.recruiter_id
    );
    return success(res, { message: "Password updated." });
  });

  // Optional demo self-registration (enabled via config, off by default).
  app.post("/api/auth/register", (req, res) => {
    if (process.env.ENABLE_REGISTRATION !== "1") {
      return fail(res, "Registration is disabled.", 404);
    }
    const [allowed, retryAfter] = registerLimiter.hit(req.ip || "unknown");
    if (!allowed) {
      return fail(
        res,
        `Too many signup attempts from your network. Try again in about ` +
          `${Math.floor(retryAfter / 60) || 1} minute(s).`,
        429
      );
    }
    if (!isJson(req)) return fail(res, "Request body must be JSON.");
    const data = req.body || {};

    const [name, nameErr] = requireString(data, "name", { maxLength: 120 });
    if (nameErr) return fail(res, nameErr);
    const [email, emailErr] = requireString(data, "email", { maxLength: 254 });
    if (emailErr) return fail(res, emailErr);
    if (!isValidEmail(email)) return fail(res, "A valid email address is required.");
    const pwErr = validatePassword(data.password);
    if (pwErr) return fail(res, pwErr);

    const db = getDb();
    const existing = db.prepare("SELECT id FROM recruiters WHERE email = ?").get(email.toLowerCase());
    if (existing !== undefined && existing !== null) {
      return fail(res, "An account with that email already exists.", 409);
    }

    const now = utcnowIso();
    const result = db
      .prepare(
        "INSERT INTO recruiters (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(name, email.toLowerCase(), bcrypt.hashSync(data.password, 10), now, now);

    const recruiter = { id: Number(result.lastInsertRowid), name, email: email.toLowerCase() };
    const csrfToken = startRecruiterSession(req, recruiter);
    ensureSettings(recruiter.id);
    return success(
      res,
      { id: recruiter.id, name, email: recruiter.email, csrf_token: csrfToken },
      201
    );
  });
}
