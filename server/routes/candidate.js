// Candidate account + profile API.
//
// Applicants sign up with an email and password. The signed session cookie
// stores `candidate_id`, so the same account can return on any device. No
// recruiter privileges are involved. Guest resume matching on /careers stays
// passwordless; this API only covers the saved candidate profile.
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { getDb, rowToDict } from "../db.js";
import { serializeJob } from "../services/application.js";
import { rankJobs } from "../services/recommend.js";
import * as resumeService from "../services/resume.js";
import { clamp, isValidEmail, parseIntOr, utcnowIso } from "../utils/helpers.js";
import { RateLimiter } from "../utils/rate_limit.js";
import { validatePassword } from "../utils/validators.js";
import { success, fail } from "../utils/responses.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: resumeService.MAX_RESUME_BYTES },
});

const registerLimiter = new RateLimiter(10, 3600);
const loginLimiter = new RateLimiter(10, 900);
const profileLimiter = new RateLimiter(20, 3600);
const DUMMY_HASH = bcrypt.hashSync("candidate-timing-equalizer", 10);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function serializeCandidate(row) {
  const candidate = rowToDict(row);
  if (candidate === null) return null;
  delete candidate.password_hash;
  delete candidate.resume_storage_path;
  delete candidate.resume_text;
  return candidate;
}

function loadCandidate(db, id) {
  if (!id) return null;
  const row = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
  return row === undefined || row === null ? null : row;
}

function findCandidateByEmail(db, email) {
  const row = db
    .prepare("SELECT * FROM candidates WHERE email COLLATE NOCASE = ?")
    .get(email);
  return row === undefined || row === null ? null : row;
}

function listApplications(db, candidateId) {
  return db
    .prepare(
      `SELECT a.id, a.public_reference, a.status, a.match_score, a.created_at,
              j.id AS job_id, j.title AS job_title, j.department, j.location,
              j.employment_type
       FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.candidate_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(candidateId)
    .map((row) => rowToDict(row));
}

/** Attach earlier guest applications with the same email to this account. */
function linkApplications(db, candidate) {
  db.prepare(
    `UPDATE applications
        SET candidate_id = ?
      WHERE candidate_id IS NULL AND lower(email) = lower(?)`
  ).run(candidate.id, candidate.email);
}

function profilePayload(db, candidate) {
  return {
    candidate: serializeCandidate(candidate),
    applications: listApplications(db, candidate.id),
  };
}

export function candidateRoutes(app, { uploadFolder }) {
  // Current account profile (null when this browser is signed out).
  app.get("/api/public/candidate/me", (req, res) => {
    const candidateId = req.session.data.candidate_id;
    if (!candidateId) return success(res, null);
    const db = getDb();
    const row = loadCandidate(db, candidateId);
    if (!row) {
      req.session.delete("candidate_id");
      return success(res, null);
    }
    return success(res, profilePayload(db, row));
  });

  // AI-ranked open jobs for this account's resume.
  app.get("/api/public/candidate/matches", async (req, res) => {
    const candidateId = req.session.data.candidate_id;
    if (!candidateId) return fail(res, "Sign in to view your matches.", 401);
    const db = getDb();
    const row = loadCandidate(db, candidateId);
    if (!row) return fail(res, "Account not found.", 404);

    const limit = clamp(parseIntOr(req.query.limit, 10) || 10, 1, 100);
    const jobs = db
      .prepare("SELECT * FROM jobs WHERE status = 'open' ORDER BY created_at DESC")
      .all()
      .map((job) => serializeJob(job));
    const ranked = await rankJobs(jobs, row.resume_text || "", limit);

    return success(
      res,
      { engine: ranked.engine, model: ranked.model, results: ranked.items },
      200,
      { open_jobs: jobs.length, returned: ranked.items.length, limit }
    );
  });

  // Create an applicant account. Multipart so the optional resume can travel
  // with the rest of the signup form.
  app.post(
    "/api/public/candidate/register",
    upload.single("resume"),
    async (req, res) => {
      const [allowed, retryAfter] = registerLimiter.hit(req.ip || "unknown");
      if (!allowed) {
        return fail(
          res,
          `Too many signup attempts from your network. Try again in about ` +
            `${Math.floor(retryAfter / 60) || 1} minute(s).`,
          429
        );
      }

      const form = req.body || {};
      const name = String(form.name || "").trim();
      const email = normalizeEmail(form.email);
      const phone = String(form.phone || "").trim();
      const password = form.password;

      if (!name || name.length > 160) return fail(res, "Please enter your full name.");
      if (!isValidEmail(email) || email.length > 254) {
        return fail(res, "Please enter a valid email address.");
      }
      if (phone.length > 40) return fail(res, "Phone number is too long.");
      const pwErr = validatePassword(password);
      if (pwErr) return fail(res, pwErr);

      const db = getDb();
      const existing = findCandidateByEmail(db, email);
      if (existing && existing.password_hash) {
        return fail(res, "An account with that email already exists. Please sign in.", 409);
      }

      let resumePath = existing ? existing.resume_storage_path : null;
      let resumeText = existing ? existing.resume_text || "" : "";
      let resumeFilename = existing ? existing.resume_original_filename : null;
      let newPath = null;

      if (req.file) {
        try {
          const saved = resumeService.saveUpload(req.file, uploadFolder);
          newPath = saved.storagePath;
          const text = await resumeService.extractText(newPath);
          resumePath = newPath;
          resumeText = text;
          resumeFilename =
            path.basename(req.file.originalname || "resume.pdf").slice(0, 200) ||
            "resume.pdf";
        } catch (e) {
          if (newPath) {
            try {
              fs.unlinkSync(newPath);
            } catch {
              /* ignore */
            }
          }
          if (e instanceof resumeService.ResumeValidationError) {
            return fail(res, e.message, 400);
          }
          console.error("Candidate signup resume failed:", e);
          return fail(res, "The resume could not be processed. Please try again.", 500);
        }
      }

      const now = utcnowIso();
      const hash = bcrypt.hashSync(password, 10);
      let id;
      try {
        if (existing) {
          // Claim a legacy passwordless profile with the same email.
          db.prepare(
            `UPDATE candidates
                SET name = ?, email = ?, phone = ?, password_hash = ?,
                    resume_original_filename = ?, resume_storage_path = ?,
                    resume_text = ?, updated_at = ?
              WHERE id = ?`
          ).run(name, email, phone, hash, resumeFilename, resumePath, resumeText, now, existing.id);
          id = existing.id;
          if (newPath && existing.resume_storage_path && existing.resume_storage_path !== newPath) {
            try {
              fs.unlinkSync(existing.resume_storage_path);
            } catch {
              /* ignore */
            }
          }
        } else {
          const result = db
            .prepare(
              `INSERT INTO candidates
                 (name, email, phone, password_hash, resume_original_filename,
                  resume_storage_path, resume_text, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(name, email, phone, hash, resumeFilename, resumePath, resumeText, now, now);
          id = Number(result.lastInsertRowid);
        }
      } catch (e) {
        if (newPath) {
          try {
            fs.unlinkSync(newPath);
          } catch {
            /* ignore */
          }
        }
        if (String(e.message).toLowerCase().includes("unique")) {
          return fail(res, "An account with that email already exists. Please sign in.", 409);
        }
        throw e;
      }

      req.session.set("candidate_id", id);
      const candidate = loadCandidate(db, id);
      linkApplications(db, candidate);
      return success(res, profilePayload(db, candidate), existing ? 200 : 201);
    }
  );

  // Sign an applicant in with email + password.
  app.post("/api/public/candidate/login", (req, res) => {
    const data = req.body || {};
    const email = normalizeEmail(data.email);
    const password = data.password;

    if (!isValidEmail(email)) return fail(res, "Enter a valid email address.");
    if (typeof password !== "string" || password === "") {
      return fail(res, "Password is required.");
    }

    const key = `${req.ip || "unknown"}|${email}`;
    const [allowed, retryAfter] = loginLimiter.check(key);
    if (!allowed) {
      return fail(res, `Too many login attempts. Try again in ${retryAfter} seconds.`, 429);
    }

    const db = getDb();
    const row = findCandidateByEmail(db, email);
    let passwordOk = false;
    if (row && row.password_hash) {
      passwordOk = bcrypt.compareSync(password, row.password_hash);
    } else {
      // Keep the comparison cost constant so missing accounts are not obvious.
      bcrypt.compareSync(password, DUMMY_HASH);
    }

    if (!row || !row.password_hash || !passwordOk) {
      loginLimiter.hit(key);
      return fail(res, "Incorrect email or password.", 401);
    }

    loginLimiter.reset(key);
    req.session.set("candidate_id", row.id);
    linkApplications(db, row);
    return success(res, profilePayload(db, row));
  });

  // Update an existing account profile (multipart: name, email, phone, resume).
  app.post(
    "/api/public/candidate/profile",
    upload.single("resume"),
    async (req, res) => {
      const candidateId = req.session.data.candidate_id;
      if (!candidateId) return fail(res, "Sign in to update your profile.", 401);

      const [allowed, retryAfter] = profileLimiter.hit(req.ip || "unknown");
      if (!allowed) {
        return fail(
          res,
          `Too many profile updates from your network. Try again in about ` +
            `${Math.floor(retryAfter / 60) || 1} minute(s).`,
          429
        );
      }

      const form = req.body || {};
      const name = String(form.name || "").trim();
      const email = normalizeEmail(form.email);
      const phone = String(form.phone || "").trim();

      if (!name || name.length > 160) return fail(res, "Please enter your full name.");
      if (!isValidEmail(email) || email.length > 254) {
        return fail(res, "Please enter a valid email address.");
      }
      if (phone.length > 40) return fail(res, "Phone number is too long.");

      const db = getDb();
      const existing = loadCandidate(db, candidateId);
      if (!existing) {
        req.session.delete("candidate_id");
        return fail(res, "Account not found. Please sign in again.", 401);
      }

      const duplicate = findCandidateByEmail(db, email);
      if (duplicate && duplicate.id !== existing.id) {
        return fail(res, "Another account already uses that email.", 409);
      }

      let resumePath = existing.resume_storage_path;
      let resumeText = existing.resume_text || "";
      let resumeFilename = existing.resume_original_filename;
      let newPath = null;

      if (req.file) {
        try {
          const saved = resumeService.saveUpload(req.file, uploadFolder);
          newPath = saved.storagePath;
          const text = await resumeService.extractText(newPath);
          resumePath = newPath;
          resumeText = text;
          resumeFilename =
            path.basename(req.file.originalname || "resume.pdf").slice(0, 200) ||
            "resume.pdf";
        } catch (e) {
          if (newPath) {
            try {
              fs.unlinkSync(newPath);
            } catch {
              /* ignore */
            }
          }
          if (e instanceof resumeService.ResumeValidationError) {
            return fail(res, e.message, 400);
          }
          console.error("Candidate resume processing failed:", e);
          return fail(res, "The resume could not be processed. Please try again.", 500);
        }
      }

      const now = utcnowIso();
      db.prepare(
        `UPDATE candidates
            SET name = ?, email = ?, phone = ?, resume_original_filename = ?,
                resume_storage_path = ?, resume_text = ?, updated_at = ?
          WHERE id = ?`
      ).run(name, email, phone, resumeFilename, resumePath, resumeText, now, existing.id);

      if (newPath && existing.resume_storage_path && existing.resume_storage_path !== newPath) {
        try {
          fs.unlinkSync(existing.resume_storage_path);
        } catch {
          /* ignore */
        }
      }

      const updated = loadCandidate(db, existing.id);
      linkApplications(db, updated);
      return success(res, profilePayload(db, updated));
    }
  );

  // Sign out of the applicant account on this device.
  app.post("/api/public/candidate/logout", (req, res) => {
    req.session.delete("candidate_id");
    return success(res, { ok: true });
  });
}
