// Candidate-facing profile API.
//
// Identity is demo-grade: the signed session cookie stores `candidate_id`, so
// a visitor can create a profile with a resume and return to it on the same
// browser without a password. No recruiter privileges are involved.
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { getDb, rowToDict } from "../db.js";
import { serializeJob } from "../services/application.js";
import { rankJobs } from "../services/recommend.js";
import * as resumeService from "../services/resume.js";
import { clamp, isValidEmail, parseIntOr, utcnowIso } from "../utils/helpers.js";
import { RateLimiter } from "../utils/rate_limit.js";
import { success, fail } from "../utils/responses.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: resumeService.MAX_RESUME_BYTES },
});

const profileLimiter = new RateLimiter(20, 3600);

function serializeCandidate(row) {
  const candidate = rowToDict(row);
  if (candidate === null) return null;
  delete candidate.resume_storage_path;
  delete candidate.resume_text;
  return candidate;
}

function loadCandidate(db, id) {
  if (!id) return null;
  const row = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
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

export function candidateRoutes(app, { uploadFolder }) {
  // Current profile (null when this browser has not created one).
  app.get("/api/public/candidate/me", (req, res) => {
    const candidateId = req.session.data.candidate_id;
    if (!candidateId) return success(res, null);
    const db = getDb();
    const row = loadCandidate(db, candidateId);
    if (!row) {
      req.session.delete("candidate_id");
      return success(res, null);
    }
    return success(res, {
      candidate: serializeCandidate(row),
      applications: listApplications(db, row.id),
    });
  });

  // AI-ranked open jobs for this profile's resume.
  app.get("/api/public/candidate/matches", async (req, res) => {
    const candidateId = req.session.data.candidate_id;
    if (!candidateId) return fail(res, "Create a profile first.", 400);
    const db = getDb();
    const row = loadCandidate(db, candidateId);
    if (!row) return fail(res, "Profile not found.", 404);

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

  // Create or update the profile (multipart: name, email, phone, resume).
  app.post(
    "/api/public/candidate/profile",
    upload.single("resume"),
    async (req, res) => {
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
      const email = String(form.email || "").trim();
      const phone = String(form.phone || "").trim();

      if (!name || name.length > 160) return fail(res, "Please enter your full name.");
      if (!isValidEmail(email) || email.length > 254) {
        return fail(res, "Please enter a valid email address.");
      }
      if (phone.length > 40) return fail(res, "Phone number is too long.");

      const db = getDb();
      const existingId = req.session.data.candidate_id;
      const existing = loadCandidate(db, existingId);

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
            path.basename(req.file.originalname || "resume.pdf").slice(0, 200) || "resume.pdf";
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
      } else if (!existing) {
        return fail(res, "Please upload your resume (PDF).");
      }

      const now = utcnowIso();

      if (existing) {
        db.prepare(
          `UPDATE candidates
             SET name = ?, email = ?, phone = ?, resume_original_filename = ?,
                 resume_storage_path = ?, resume_text = ?, updated_at = ?
           WHERE id = ?`
        ).run(name, email, phone, resumeFilename, resumePath, resumeText, now, existing.id);
        // Remove the previous file when a new resume replaced it.
        if (newPath && existing.resume_storage_path && existing.resume_storage_path !== newPath) {
          try {
            fs.unlinkSync(existing.resume_storage_path);
          } catch {
            /* ignore */
          }
        }
        req.session.set("candidate_id", existing.id);
        const updated = loadCandidate(db, existing.id);
        return success(res, { candidate: serializeCandidate(updated) });
      }

      const result = db
        .prepare(
          `INSERT INTO candidates
             (name, email, phone, resume_original_filename, resume_storage_path,
              resume_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, email, phone, resumeFilename, resumePath, resumeText, now, now);
      const id = Number(result.lastInsertRowid);
      req.session.set("candidate_id", id);
      const created = loadCandidate(db, id);
      return success(res, { candidate: serializeCandidate(created) }, 201);
    }
  );

  // Forget the profile on this device (does not delete applications).
  app.post("/api/public/candidate/logout", (req, res) => {
    req.session.delete("candidate_id");
    return success(res, { ok: true });
  });
}
