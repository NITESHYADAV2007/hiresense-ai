// Application service layer: persistence helpers shared by the route modules.
import crypto from "node:crypto";
import { getDb, rowToDict } from "../db.js";
import { utcnowIso } from "../utils/helpers.js";

export const APPLICATION_STATUSES = [
  "Applied",
  "Under Review",
  "Shortlisted",
  "Interview",
  "Hired",
  "Rejected",
];

/** Opaque, non-sequential public reference for a candidate confirmation page. */
export function generatePublicReference() {
  return "HS-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

/** Convert a jobs row into an API-safe dict. */
export function serializeJob(row, applicantCount = undefined) {
  const job = rowToDict(row);
  if (job === null) return null;
  let skills = [];
  try {
    skills = JSON.parse(job.required_skills_json || "[]");
  } catch {
    skills = [];
  }
  delete job.required_skills_json;
  job.required_skills = Array.isArray(skills) ? skills : [];
  if (applicantCount !== undefined) job.applicant_count = applicantCount;
  return job;
}

export function serializeApplication(row) {
  const app = rowToDict(row);
  if (app === null) return null;
  delete app.resume_storage_path; // never expose internal storage paths
  return app;
}

export function countApplicants(jobId) {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM applications WHERE job_id = ?")
    .get(jobId);
  return row ? Number(row.c) : 0;
}

export function recordStatusChange(applicationId, oldStatus, newStatus, recruiterId) {
  const db = getDb();
  db.prepare(
    `INSERT INTO application_status_history
       (application_id, old_status, new_status, changed_by_recruiter_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(applicationId, oldStatus, newStatus, recruiterId, utcnowIso());
}

/** Persist an analysis result and update the application's match_score. */
export function saveMatchResult(applicationId, analysis) {
  const db = getDb();
  const now = utcnowIso();
  db.prepare(
    `INSERT INTO match_results
       (application_id, similarity_score, matched_skills_json,
        skills_not_detected_json, explanation, engine, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    applicationId,
    analysis.similarity_score,
    JSON.stringify(analysis.matched_skills),
    JSON.stringify(analysis.skills_not_detected),
    analysis.explanation,
    analysis.engine || "tfidf",
    now
  );
  db.prepare("UPDATE applications SET match_score = ?, updated_at = ? WHERE id = ?").run(
    analysis.similarity_score,
    now,
    applicationId
  );
  return {
    application_id: applicationId,
    similarity_score: analysis.similarity_score,
    matched_skills: analysis.matched_skills,
    skills_not_detected: analysis.skills_not_detected,
    explanation: analysis.explanation,
    engine: analysis.engine || "tfidf",
    analyzed_at: now,
  };
}

export function loadMatchResult(applicationId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT similarity_score, matched_skills_json, skills_not_detected_json,
              explanation, engine, created_at
       FROM match_results WHERE application_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .get(applicationId);
  if (row === undefined || row === null) return null;
  let matched = [];
  let missing = [];
  try {
    matched = JSON.parse(row.matched_skills_json || "[]");
    missing = JSON.parse(row.skills_not_detected_json || "[]");
  } catch {
    matched = [];
    missing = [];
  }
  return {
    application_id: applicationId,
    similarity_score: row.similarity_score,
    matched_skills: matched,
    skills_not_detected: missing,
    explanation: row.explanation,
    engine: row.engine || "tfidf",
    analyzed_at: row.created_at,
  };
}

/** Return the recruiter's settings row, creating a default if missing. */
export function ensureSettings(recruiterId) {
  const db = getDb();
  let row = db
    .prepare(
      "SELECT id, recruiter_id, page_size, default_sort, updated_at FROM recruiter_settings WHERE recruiter_id = ?"
    )
    .get(recruiterId);
  if (row === undefined || row === null) {
    db.prepare(
      `INSERT INTO recruiter_settings (recruiter_id, page_size, default_sort, updated_at)
       VALUES (?, 10, 'newest', ?)`
    ).run(recruiterId, utcnowIso());
    row = db
      .prepare(
        "SELECT id, recruiter_id, page_size, default_sort, updated_at FROM recruiter_settings WHERE recruiter_id = ?"
      )
      .get(recruiterId);
  }
  return rowToDict(row);
}
