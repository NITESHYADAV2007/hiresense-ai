// Public (candidate-facing) endpoints: browse jobs and submit applications.
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { getDb, rowToDict } from "../db.js";
import { serializeJob, generatePublicReference, saveMatchResult } from "../services/application.js";
import { analyzeAsync } from "../services/matching.js";
import { rankJobs } from "../services/recommend.js";
import * as resumeService from "../services/resume.js";
import { utcnowIso, parseIntOr, clamp } from "../utils/helpers.js";
import { RateLimiter } from "../utils/rate_limit.js";
import { success, fail, paginatedMeta } from "../utils/responses.js";
import { validateCandidatePayload } from "../utils/validators.js";

// Prevent abuse of the public application form (per IP).
const applicationLimiter = new RateLimiter(10, 3600);
// Resume-to-jobs matching is cheaper than a full application but still
// CPU-bound, so it gets its own limiter.
const recommendationLimiter = new RateLimiter(20, 3600);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: resumeService.MAX_RESUME_BYTES },
});

function numericId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || String(id) !== String(value)) return null;
  return id;
}

export function publicRoutes(app, { uploadFolder }) {
  app.get("/api/public/jobs", (req, res) => {
    const q = req.query;
    const page = Math.max(1, parseIntOr(q.page, 1) || 1);
    const perPage = Math.max(1, Math.min(parseIntOr(q.per_page, 9) || 9, 50));

    const where = ["status = 'open'"];
    const params = [];

    const search = String(q.q || q.search || "").trim();
    if (search) {
      where.push("(title LIKE ? OR description LIKE ? OR department LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const department = String(q.department || "").trim();
    if (department) {
      where.push("department = ?");
      params.push(department);
    }
    const location = String(q.location || "").trim();
    if (location) {
      where.push("location = ?");
      params.push(location);
    }
    const employmentType = String(q.employment_type || "").trim();
    if (employmentType) {
      where.push("employment_type = ?");
      params.push(employmentType);
    }

    const whereSql = where.join(" AND ");
    const db = getDb();
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS c FROM jobs WHERE ${whereSql}`).get(...params).c
    );
    const rows = db
      .prepare(
        `SELECT * FROM jobs WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, perPage, (page - 1) * perPage);

    const data = rows.map((row) => {
      const job = serializeJob(row);
      const description = job.description || "";
      job.description_preview =
        description.length > 220 ? description.slice(0, 220) + "..." : description;
      delete job.recruiter_id;
      return job;
    });

    return success(res, data, 200, paginatedMeta(page, perPage, total));
  });

  // Distinct filter values across open jobs.
  app.get("/api/public/jobs/filters", (req, res) => {
    const db = getDb();
    const departments = db
      .prepare("SELECT DISTINCT department FROM jobs WHERE status = 'open' ORDER BY department")
      .all()
      .map((r) => r.department);
    const locations = db
      .prepare("SELECT DISTINCT location FROM jobs WHERE status = 'open' ORDER BY location")
      .all()
      .map((r) => r.location);
    const types = db
      .prepare(
        "SELECT DISTINCT employment_type FROM jobs WHERE status = 'open' ORDER BY employment_type"
      )
      .all()
      .map((r) => r.employment_type);
    return success(res, { departments, locations, employment_types: types });
  });

  // Rank all open jobs against an uploaded resume (no profile required).
  app.post(
    "/api/public/recommendations",
    upload.single("resume"),
    async (req, res) => {
      const [allowed, retryAfter] = recommendationLimiter.hit(req.ip || "unknown");
      if (!allowed) {
        return fail(
          res,
          `Too many resume analyses from your network. Try again in about ` +
            `${Math.floor(retryAfter / 60) || 1} minute(s).`,
          429
        );
      }

      let storagePath = null;
      let text;
      try {
        const saved = resumeService.saveUpload(req.file, uploadFolder);
        storagePath = saved.storagePath;
        text = await resumeService.extractText(storagePath);
      } catch (e) {
        if (storagePath) {
          try {
            fs.unlinkSync(storagePath);
          } catch {
            /* ignore */
          }
        }
        if (e instanceof resumeService.ResumeValidationError) return fail(res, e.message, 400);
        console.error("Recommendation resume failed:", e);
        return fail(res, "The resume could not be processed. Please try again.", 500);
      }

      // The file is only needed for this analysis; do not retain it.
      try {
        fs.unlinkSync(storagePath);
      } catch {
        /* ignore */
      }

      const limit = clamp(parseIntOr(req.body && req.body.limit, 10) || 10, 1, 100);
      const db = getDb();
      const jobs = db
        .prepare("SELECT * FROM jobs WHERE status = 'open' ORDER BY created_at DESC")
        .all()
        .map((row) => serializeJob(row));
      const ranked = await rankJobs(jobs, text, limit);

      return success(
        res,
        {
          engine: ranked.engine,
          model: ranked.model,
          resume_filename: path
            .basename((req.file && req.file.originalname) || "resume.pdf")
            .slice(0, 200),
          results: ranked.items,
        },
        200,
        { open_jobs: jobs.length, returned: ranked.items.length, limit }
      );
    }
  );

  app.get("/api/public/jobs/:id", (req, res) => {
    const jobId = numericId(req.params.id);
    if (jobId === null) return fail(res, "Job not found.", 404);
    const db = getDb();
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    if (row === undefined || row === null) return fail(res, "Job not found.", 404);
    const job = serializeJob(row);
    delete job.recruiter_id;
    return success(res, job);
  });

  app.post(
    "/api/public/jobs/:id/applications",
    upload.single("resume"),
    async (req, res) => {
      const [allowed, retryAfter] = applicationLimiter.hit(req.ip || "unknown");
      if (!allowed) {
        return fail(
          res,
          `Too many applications from your network. Try again in about ` +
            `${Math.floor(retryAfter / 60) || 1} minute(s).`,
          429
        );
      }

      const jobId = numericId(req.params.id);
      if (jobId === null) return fail(res, "Job not found.", 404);

      const db = getDb();
      const jobRow = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (jobRow === undefined || jobRow === null) return fail(res, "Job not found.", 404);
      if (jobRow.status !== "open") {
        return fail(res, "This job is no longer accepting applications.", 409);
      }

      // Client fields arrive as multipart form fields; the resume is a file part.
      const form = req.body || {};
      const [cleaned, err] = validateCandidatePayload(form);
      if (err) return fail(res, err);

      const originalFilename = (req.file && req.file.originalname) || "resume.pdf";
      let storageName;
      let storagePath;
      let text;
      try {
        ({ storageName, storagePath } = resumeService.saveUpload(req.file, uploadFolder));
        text = await resumeService.extractText(storagePath);
      } catch (e) {
        if (e instanceof resumeService.ResumeValidationError) {
          return fail(res, e.message, 400);
        }
        console.error("Resume processing failed:", e);
        return fail(res, "The resume could not be processed. Please try again.", 500);
      }

      const job = serializeJob(jobRow);
      const analysis = await analyzeAsync(job, text);

      // Link the application to a candidate profile when this browser has one
      // and the emails match. Passwordless profiles are demo-grade identity.
      let candidateId = null;
      const sessionCandidateId = req.session.data.candidate_id;
      if (sessionCandidateId) {
        const candidate = db
          .prepare("SELECT id, email FROM candidates WHERE id = ?")
          .get(sessionCandidateId);
        if (
          candidate &&
          String(candidate.email).toLowerCase() === cleaned.email.toLowerCase()
        ) {
          candidateId = candidate.id;
        }
      }

      const now = utcnowIso();
      const reference = generatePublicReference();
      const result = db
        .prepare(
          `INSERT INTO applications
             (public_reference, job_id, candidate_id, candidate_name, email, phone, portfolio_url,
              resume_original_filename, resume_storage_path, resume_text,
              match_score, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, ?)`
        )
        .run(
          reference,
          jobId,
          candidateId,
          cleaned.candidate_name,
          cleaned.email,
          cleaned.phone,
          cleaned.portfolio_url,
          // Store a sanitised display copy of the client filename only.
          path.basename(originalFilename).slice(0, 200) || "resume.pdf",
          storagePath,
          text,
          analysis.similarity_score,
          now,
          now
        );
      const applicationId = Number(result.lastInsertRowid);
      saveMatchResult(applicationId, analysis);
      db.prepare(
        `INSERT INTO application_status_history
           (application_id, old_status, new_status, changed_by_recruiter_id, created_at)
         VALUES (?, NULL, 'Applied', NULL, ?)`
      ).run(applicationId, now);

      return success(
        res,
        {
          public_reference: reference,
          job_title: jobRow.title,
          created_at: now,
        },
        201
      );
    }
  );

  // Minimal, non-sensitive confirmation lookup by opaque reference.
  app.get("/api/public/applications/:reference", (req, res) => {
    const reference = req.params.reference;
    if (!reference || reference.length > 64) {
      return fail(res, "Invalid application reference.", 400);
    }
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.public_reference, a.created_at, a.status, j.title AS job_title
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.public_reference = ?`
      )
      .get(reference);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);
    // Deliberately excludes the candidate's personal details.
    return success(res, rowToDict(row));
  });
}
