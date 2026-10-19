// Recruiter application management endpoints (authentication required).
import fs from "node:fs";
import path from "node:path";
import { getDb, rowToDict } from "../db.js";
import { loginRequired } from "../auth.js";
import {
  APPLICATION_STATUSES,
  loadMatchResult,
  recordStatusChange,
  saveMatchResult,
  serializeApplication,
} from "../services/application.js";
import { analyzeAsync } from "../services/matching.js";
import { utcnowIso, parseIntOr } from "../utils/helpers.js";
import { success, fail, paginatedMeta } from "../utils/responses.js";
import {
  APPLICATION_SORTS,
  NOTE_MAX,
  validateApplicationStatus,
} from "../utils/validators.js";

function numericId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || String(id) !== String(value)) return null;
  return id;
}

function clampPagination(query) {
  const page = Math.max(1, parseIntOr(query.page, 1) || 1);
  const perPage = Math.max(1, Math.min(parseIntOr(query.per_page, 10) || 10, 200));
  return [page, perPage];
}

/** Build a WHERE clause for recruiter-scoped application queries. */
function buildFilters(req) {
  const q = req.query;
  const where = ["j.recruiter_id = ?"];
  const params = [req.recruiter.id];

  const search = String(q.search || q.q || "").trim();
  if (search) {
    where.push("(a.candidate_name LIKE ? OR a.email LIKE ? OR j.title LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const jobId = parseIntOr(q.job_id);
  if (jobId !== null) {
    where.push("a.job_id = ?");
    params.push(jobId);
  }

  const status = String(q.status || "").trim();
  if (status) {
    const err = validateApplicationStatus(status);
    if (err) throw new Error(err);
    where.push("a.status = ?");
    params.push(status);
  }

  const minScore = q.min_score;
  if (minScore !== undefined && minScore !== null && minScore !== "") {
    const value = parseIntOr(minScore);
    if (value === null || value < 0 || value > 100) {
      throw new Error("'min_score' must be between 0 and 100.");
    }
    where.push("a.match_score >= ?");
    params.push(value);
  }

  const maxScore = q.max_score;
  if (maxScore !== undefined && maxScore !== null && maxScore !== "") {
    const value = parseIntOr(maxScore);
    if (value === null || value < 0 || value > 100) {
      throw new Error("'max_score' must be between 0 and 100.");
    }
    where.push("a.match_score <= ?");
    params.push(value);
  }

  const dateFrom = String(q.date_from || "").trim();
  if (dateFrom) {
    where.push("a.created_at >= ?");
    params.push(dateFrom);
  }
  const dateTo = String(q.date_to || "").trim();
  if (dateTo) {
    where.push("a.created_at <= ?");
    params.push(dateTo + (dateTo.length === 10 ? "T23:59:59Z" : ""));
  }

  return { whereSql: where.join(" AND "), params };
}

function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function applicationsRoutes(app, { uploadFolder }) {
  app.get("/api/applications", loginRequired, (req, res) => {
    const q = req.query;
    let [page, perPage] = clampPagination(q);

    const limit = parseIntOr(q.limit);
    if (limit !== null) {
      perPage = Math.max(1, Math.min(limit, 200));
      page = 1;
    }

    let filters;
    try {
      filters = buildFilters(req);
    } catch (e) {
      return fail(res, e.message);
    }
    const { whereSql, params } = filters;

    const sortKey = String(q.sort || "newest").trim();
    const orderBy = APPLICATION_SORTS[sortKey];
    if (!orderBy) {
      return fail(res, `Invalid sort option. Valid options: ${Object.keys(APPLICATION_SORTS).join(", ")}.`);
    }

    const db = getDb();

    if (String(q.group_by || "").trim() === "status") {
      const rows = db
        .prepare(
          `SELECT a.*, j.title AS job_title
           FROM applications a JOIN jobs j ON j.id = a.job_id
           WHERE ${whereSql} ORDER BY a.created_at DESC`
        )
        .all(...params);
      const grouped = {};
      for (const status of APPLICATION_STATUSES) grouped[status] = [];
      for (const row of rows) {
        const application = serializeApplication(row);
        application.job_title = row.job_title;
        grouped[application.status].push(application);
      }
      return success(res, grouped);
    }

    const total = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM applications a
           JOIN jobs j ON j.id = a.job_id WHERE ${whereSql}`
        )
        .get(...params).c
    );

    const rows = db
      .prepare(
        `SELECT a.*, j.title AS job_title
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(...params, perPage, (page - 1) * perPage);

    const data = rows.map((row) => {
      const application = serializeApplication(row);
      application.job_title = row.job_title;
      return application;
    });

    if (limit !== null) return success(res, data);
    return success(res, data, 200, paginatedMeta(page, perPage, total));
  });

  // CSV export honouring the same filters as the listing.
  app.get("/api/applications/export", loginRequired, (req, res) => {
    let filters;
    try {
      filters = buildFilters(req);
    } catch (e) {
      return fail(res, e.message);
    }
    const { whereSql, params } = filters;

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT a.candidate_name, a.email, a.phone, a.match_score, a.status,
                a.created_at, j.title AS job_title
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE ${whereSql} ORDER BY a.created_at DESC`
      )
      .all(...params);

    const lines = [["Candidate", "Email", "Phone", "Job", "Match Score", "Status", "Applied Date"]];
    for (const row of rows) {
      lines.push([
        row.candidate_name,
        row.email,
        row.phone,
        row.job_title,
        row.match_score === null || row.match_score === undefined ? "" : row.match_score,
        row.status,
        row.created_at,
      ]);
    }
    const csv = lines.map((line) => line.map(csvField).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="hiresense-applications.csv"');
    // utf-8-sig BOM so Excel opens the file with the right encoding.
    return res.send("\uFEFF" + csv);
  });

  app.get("/api/applications/:id", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.*, j.title AS job_title, j.required_skills_json,
                j.description AS job_description
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);

    const application = serializeApplication(row);
    application.job_title = row.job_title;
    try {
      application.job_required_skills = JSON.parse(row.required_skills_json || "[]");
    } catch {
      application.job_required_skills = [];
    }

    const resumeText = application.resume_text || "";
    application.resume_text_preview = resumeText.slice(0, 4000);
    application.resume_text_length = resumeText.length;

    const notes = db
      .prepare(
        `SELECT n.id, n.note, n.created_at, r.name AS recruiter_name
         FROM application_notes n JOIN recruiters r ON r.id = n.recruiter_id
         WHERE n.application_id = ? ORDER BY n.created_at DESC, n.id DESC`
      )
      .all(appId);
    application.notes = notes.map((n) => rowToDict(n));

    const history = db
      .prepare(
        `SELECT id, old_status, new_status, created_at
         FROM application_status_history WHERE application_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(appId);
    application.status_history = history.map((h) => rowToDict(h));

    application.match = loadMatchResult(appId);
    return success(res, application);
  });

  app.patch("/api/applications/:id/status", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.id, a.status FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const data = req.body || {};
    const err = validateApplicationStatus(data.status);
    if (err) return fail(res, err);

    const newStatus = data.status;
    const oldStatus = row.status;
    db.prepare("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?").run(
      newStatus,
      utcnowIso(),
      appId
    );
    recordStatusChange(appId, oldStatus, newStatus, req.recruiter.id);
    return success(res, { id: appId, status: newStatus, old_status: oldStatus });
  });

  app.get("/api/applications/:id/match", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);

    const result = loadMatchResult(appId);
    if (result === null) {
      return fail(
        res,
        "No analysis has been run for this application yet. " +
          "Use the Reanalyze action to generate one.",
        404
      );
    }
    return success(res, result);
  });

  app.post("/api/applications/:id/analyze", loginRequired, async (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.id, a.resume_text, a.job_id, j.title, j.department, j.description,
                j.required_skills_json, j.updated_at AS job_updated_at
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);

    let skills = [];
    try {
      skills = JSON.parse(row.required_skills_json || "[]");
    } catch {
      skills = [];
    }
    const job = {
      id: row.job_id,
      updated_at: row.job_updated_at,
      title: row.title,
      department: row.department,
      description: row.description,
      required_skills: skills,
    };
    const analysis = await analyzeAsync(job, row.resume_text || "");
    const result = saveMatchResult(appId, analysis);
    return success(res, result, 201);
  });

  app.get("/api/applications/:id/resume", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.resume_storage_path, a.resume_original_filename
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);

    // Defence in depth: only serve files that live inside the uploads folder.
    const uploadsRoot = path.resolve(uploadFolder);
    const resolved = path.resolve(row.resume_storage_path || "");
    const inside =
      resolved === uploadsRoot || resolved.startsWith(uploadsRoot + path.sep);
    if (!inside || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return fail(res, "The resume file is no longer available.", 404);
    }
    res.type("application/pdf");
    return res.download(resolved, row.resume_original_filename || "resume.pdf");
  });

  // Delete an application and its dependent records (notes, history, matches).
  app.delete("/api/applications/:id", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.id, a.resume_storage_path FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);

    db.prepare("DELETE FROM application_notes WHERE application_id = ?").run(appId);
    db.prepare("DELETE FROM application_status_history WHERE application_id = ?").run(appId);
    db.prepare("DELETE FROM match_results WHERE application_id = ?").run(appId);
    db.prepare("DELETE FROM applications WHERE id = ?").run(appId);

    // Best-effort removal of the stored resume file.
    const storedPath = row.resume_storage_path;
    if (storedPath) {
      try {
        const uploadsRoot = path.resolve(uploadFolder);
        const resolved = path.resolve(storedPath);
        if (resolved.startsWith(uploadsRoot + path.sep) && fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
        }
      } catch {
        /* ignore */
      }
    }

    return success(res, { message: "Application deleted." });
  });

  app.post("/api/applications/:id/notes", loginRequired, (req, res) => {
    const appId = numericId(req.params.id);
    if (appId === null) return fail(res, "Resource not found.", 404);
    const db = getDb();
    const row = db
      .prepare(
        `SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(appId, req.recruiter.id);
    if (row === undefined || row === null) return fail(res, "Application not found.", 404);
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const data = req.body || {};
    let note = data.note;
    if (typeof note !== "string" || !note.trim()) return fail(res, "'note' is required.");
    note = note.trim();
    if (note.length > NOTE_MAX) {
      return fail(res, `'note' must be at most ${NOTE_MAX} characters.`);
    }

    const now = utcnowIso();
    const result = db
      .prepare(
        "INSERT INTO application_notes (application_id, recruiter_id, note, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(appId, req.recruiter.id, note, now);
    return success(
      res,
      {
        id: Number(result.lastInsertRowid),
        application_id: appId,
        note,
        created_at: now,
        recruiter_name: req.recruiter.name,
      },
      201
    );
  });
}
