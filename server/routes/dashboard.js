// Recruiter dashboard endpoints: summary metrics and application trends.
import { getDb, rowToDict } from "../db.js";
import { loginRequired } from "../auth.js";
import { serializeJob } from "../services/application.js";
import { success } from "../utils/responses.js";

export function dashboardRoutes(app) {
  app.get("/api/dashboard/summary", loginRequired, (req, res) => {
    const db = getDb();
    const rid = req.recruiter.id;

    const openJobs = Number(
      db
        .prepare("SELECT COUNT(*) AS c FROM jobs WHERE recruiter_id = ? AND status = 'open'")
        .get(rid).c
    );

    const totalApps = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM applications a
           JOIN jobs j ON j.id = a.job_id WHERE j.recruiter_id = ?`
        )
        .get(rid).c
    );

    const countStatus = (status) =>
      Number(
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM applications a
             JOIN jobs j ON j.id = a.job_id
             WHERE j.recruiter_id = ? AND a.status = ?`
          )
          .get(rid, status).c
      );

    const recentJobsRows = db
      .prepare(
        `SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id)
                AS applicant_count
         FROM jobs j WHERE j.recruiter_id = ?
         ORDER BY j.created_at DESC LIMIT 5`
      )
      .all(rid);

    const recentAppsRows = db
      .prepare(
        `SELECT a.id, a.candidate_name, a.match_score, a.status, a.created_at,
                j.title AS job_title
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.recruiter_id = ?
         ORDER BY a.created_at DESC LIMIT 5`
      )
      .all(rid);

    return success(res, {
      open_jobs: openJobs,
      total_applications: totalApps,
      shortlisted: countStatus("Shortlisted"),
      interviews: countStatus("Interview"),
      hired: countStatus("Hired"),
      total_jobs: Number(
        db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE recruiter_id = ?").get(rid).c
      ),
      recent_jobs: recentJobsRows.map((row) => serializeJob(row, row.applicant_count)),
      recent_applications: recentAppsRows.map((r) => rowToDict(r)),
    });
  });

  // Daily application counts for the last 30 days (zero-filled).
  app.get("/api/dashboard/trends", loginRequired, (req, res) => {
    const db = getDb();
    const rid = req.recruiter.id;
    const days = 30;

    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const startMs = todayUtc - (days - 1) * dayMs;
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const start = iso(startMs);

    const rows = db
      .prepare(
        `SELECT substr(a.created_at, 1, 10) AS day, COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.recruiter_id = ? AND a.created_at >= ?
         GROUP BY day ORDER BY day`
      )
      .all(rid, start);

    const counts = {};
    for (const row of rows) counts[row.day] = Number(row.count);

    const series = [];
    for (let offset = 0; offset < days; offset++) {
      const day = iso(startMs + offset * dayMs);
      series.push({ date: day, count: counts[day] || 0 });
    }

    return success(res, { days, series });
  });
}
