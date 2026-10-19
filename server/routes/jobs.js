// Recruiter job management endpoints (all require authentication).
import { getDb, rowToDict } from "../db.js";
import { loginRequired } from "../auth.js";
import { countApplicants, serializeJob } from "../services/application.js";
import { utcnowIso } from "../utils/helpers.js";
import { success, fail, paginatedMeta } from "../utils/responses.js";
import { JOB_SORTS, validateJobPayload, validateJobStatus } from "../utils/validators.js";
import { parseIntOr } from "../utils/helpers.js";

function clampPagination(query) {
  let page = parseIntOr(query.page, 1);
  if (!page) page = 1;
  page = Math.max(1, page);
  let perPage = parseIntOr(query.per_page, 10);
  if (!perPage) perPage = 10;
  perPage = Math.max(1, Math.min(perPage, 100));
  return [page, perPage];
}

function numericId(res, value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || String(id) !== String(value)) return null;
  return id;
}

export function jobsRoutes(app) {
  // List jobs with filters, sorting and pagination.
  app.get("/api/jobs", loginRequired, (req, res) => {
    const q = req.query;
    let [page, perPage] = clampPagination(q);

    // `limit` supports the dashboard's "recent jobs" widget.
    const limit = parseIntOr(q.limit);
    if (limit !== null) {
      perPage = Math.max(1, Math.min(limit, 100));
      page = 1;
    }

    const where = ["j.recruiter_id = ?"];
    const params = [req.recruiter.id];

    const search = String(q.search || q.q || "").trim();
    if (search) {
      where.push("j.title LIKE ?");
      params.push(`%${search}%`);
    }

    const status = String(q.status || "").trim();
    if (status) {
      const err = validateJobStatus(status);
      if (err) return fail(res, err);
      where.push("j.status = ?");
      params.push(status);
    }

    const department = String(q.department || "").trim();
    if (department) {
      where.push("j.department = ?");
      params.push(department);
    }

    const location = String(q.location || "").trim();
    if (location) {
      where.push("j.location = ?");
      params.push(location);
    }

    const sortKey = String(q.sort || "newest").trim();
    const orderBy = JOB_SORTS[sortKey];
    if (!orderBy) {
      return fail(res, `Invalid sort option. Valid options: ${Object.keys(JOB_SORTS).join(", ")}.`);
    }

    const db = getDb();
    const whereSql = where.join(" AND ");

    const total = Number(
      db.prepare(`SELECT COUNT(*) AS c FROM jobs j WHERE ${whereSql}`).get(...params).c
    );

    const rows = db
      .prepare(
        `SELECT j.* FROM jobs j WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(...params, perPage, (page - 1) * perPage);

    const data = rows.map((row) => serializeJob(row, countApplicants(row.id)));

    if (limit !== null) return success(res, data);
    return success(res, data, 200, paginatedMeta(page, perPage, total));
  });

  // Create a job.
  app.post("/api/jobs", loginRequired, (req, res) => {
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const [cleaned, err] = validateJobPayload(req.body || {});
    if (err) return fail(res, err);

    const db = getDb();
    const now = utcnowIso();
    const result = db
      .prepare(
        `INSERT INTO jobs (recruiter_id, title, department, location,
                           employment_type, experience_level, description,
                           required_skills_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .run(
        req.recruiter.id,
        cleaned.title,
        cleaned.department,
        cleaned.location,
        cleaned.employment_type,
        cleaned.experience_level,
        cleaned.description,
        JSON.stringify(cleaned.required_skills),
        now,
        now
      );
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(result.lastInsertRowid));
    return success(res, serializeJob(row, 0), 201);
  });

  // Distinct departments and locations for filter dropdowns.
  app.get("/api/jobs/meta", loginRequired, (req, res) => {
    const db = getDb();
    const departments = db
      .prepare("SELECT DISTINCT department FROM jobs WHERE recruiter_id = ? ORDER BY department")
      .all(req.recruiter.id)
      .map((r) => r.department);
    const locations = db
      .prepare("SELECT DISTINCT location FROM jobs WHERE recruiter_id = ? ORDER BY location")
      .all(req.recruiter.id)
      .map((r) => r.location);
    return success(res, { departments, locations });
  });

  app.get("/api/jobs/:id", loginRequired, (req, res) => {
    const jobId = numericId(res, req.params.id);
    if (jobId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM jobs WHERE id = ? AND recruiter_id = ?")
      .get(jobId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Job not found.", 404);
    return success(res, serializeJob(row, countApplicants(jobId)));
  });

  app.put("/api/jobs/:id", loginRequired, (req, res) => {
    const jobId = numericId(res, req.params.id);
    if (jobId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM jobs WHERE id = ? AND recruiter_id = ?")
      .get(jobId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Job not found.", 404);
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const [cleaned, err] = validateJobPayload(req.body || {});
    if (err) return fail(res, err);

    db.prepare(
      `UPDATE jobs SET title = ?, department = ?, location = ?,
            employment_type = ?, experience_level = ?, description = ?,
            required_skills_json = ?, updated_at = ?
       WHERE id = ? AND recruiter_id = ?`
    ).run(
      cleaned.title,
      cleaned.department,
      cleaned.location,
      cleaned.employment_type,
      cleaned.experience_level,
      cleaned.description,
      JSON.stringify(cleaned.required_skills),
      utcnowIso(),
      jobId,
      req.recruiter.id
    );
    const updated = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    return success(res, serializeJob(updated, countApplicants(jobId)));
  });

  app.patch("/api/jobs/:id/status", loginRequired, (req, res) => {
    const jobId = numericId(res, req.params.id);
    if (jobId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM jobs WHERE id = ? AND recruiter_id = ?")
      .get(jobId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Job not found.", 404);
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const data = req.body || {};
    const err = validateJobStatus(data.status);
    if (err) return fail(res, err);

    db.prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?").run(
      data.status,
      utcnowIso(),
      jobId
    );
    const updated = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    return success(res, serializeJob(updated, countApplicants(jobId)));
  });

  app.get("/api/jobs/:id/applications", loginRequired, (req, res) => {
    const jobId = numericId(res, req.params.id);
    if (jobId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const job = db
      .prepare("SELECT id FROM jobs WHERE id = ? AND recruiter_id = ?")
      .get(jobId, req.recruiter.id);
    if (job === undefined || job === null) return fail(res, "Job not found.", 404);

    const [page, perPage] = clampPagination(req.query);
    const total = Number(
      db.prepare("SELECT COUNT(*) AS c FROM applications WHERE job_id = ?").get(jobId).c
    );
    const rows = db
      .prepare(
        `SELECT id, public_reference, candidate_name, email, match_score,
                status, created_at
         FROM applications WHERE job_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(jobId, perPage, (page - 1) * perPage);
    const data = rows.map((r) => rowToDict(r));
    return success(res, data, 200, paginatedMeta(page, perPage, total));
  });

  app.delete("/api/jobs/:id", loginRequired, (req, res) => {
    const jobId = numericId(res, req.params.id);
    if (jobId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM jobs WHERE id = ? AND recruiter_id = ?")
      .get(jobId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Job not found.", 404);
    db.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
    return success(res, { message: "Job deleted." });
  });
}
