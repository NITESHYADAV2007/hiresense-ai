// Recruitment analytics endpoints computed from persisted records.
import { getDb } from "../db.js";
import { loginRequired } from "../auth.js";
import { APPLICATION_STATUSES } from "../services/application.js";
import { containsTerm, synonymsFor } from "../services/matching.js";
import { success } from "../utils/responses.js";
import { parseIntOr } from "../utils/helpers.js";

/** Return { appWhere, appParams, jobWhere, jobParams } from the query string. */
function baseFilters(req) {
  const q = req.query;
  const rid = req.recruiter.id;

  const appWhere = ["j.recruiter_id = ?"];
  const appParams = [rid];
  const jobWhere = ["recruiter_id = ?"];
  const jobParams = [rid];

  const dateFrom = String(q.date_from || "").trim();
  if (dateFrom) {
    appWhere.push("a.created_at >= ?");
    appParams.push(dateFrom);
  }

  const dateTo = String(q.date_to || "").trim();
  if (dateTo) {
    const bound = dateTo + (dateTo.length === 10 ? "T23:59:59Z" : "");
    appWhere.push("a.created_at <= ?");
    appParams.push(bound);
  }

  const jobId = parseIntOr(q.job_id);
  if (jobId !== null) {
    appWhere.push("a.job_id = ?");
    appParams.push(jobId);
    jobWhere.push("id = ?");
    jobParams.push(jobId);
  }

  const department = String(q.department || "").trim();
  if (department) {
    appWhere.push("j.department = ?");
    appParams.push(department);
    jobWhere.push("department = ?");
    jobParams.push(department);
  }

  return {
    appWhere: appWhere.join(" AND "),
    appParams,
    jobWhere: jobWhere.join(" AND "),
    jobParams,
  };
}

export function analyticsRoutes(app) {
  app.get("/api/analytics/summary", loginRequired, (req, res) => {
    const { appWhere, appParams, jobWhere, jobParams } = baseFilters(req);
    const db = getDb();

    const totalApps = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM applications a
           JOIN jobs j ON j.id = a.job_id WHERE ${appWhere}`
        )
        .get(...appParams).c
    );

    const jobsCreated = Number(
      db.prepare(`SELECT COUNT(*) AS c FROM jobs WHERE ${jobWhere}`).get(...jobParams).c
    );

    const countStatus = (status) =>
      Number(
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM applications a
             JOIN jobs j ON j.id = a.job_id
             WHERE ${appWhere} AND a.status = ?`
          )
          .get(...appParams, status).c
      );

    const openJobs = Number(
      db
        .prepare(`SELECT COUNT(*) AS c FROM jobs WHERE ${jobWhere} AND status = 'open'`)
        .get(...jobParams).c
    );

    return success(res, {
      applications_received: totalApps,
      jobs_created: jobsCreated,
      open_jobs: openJobs,
      shortlisted: countStatus("Shortlisted"),
      interviews: countStatus("Interview"),
      hires: countStatus("Hired"),
      rejected: countStatus("Rejected"),
    });
  });

  app.get("/api/analytics/applications-over-time", loginRequired, (req, res) => {
    const { appWhere, appParams } = baseFilters(req);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT substr(a.created_at, 1, 10) AS day, COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE ${appWhere}
         GROUP BY day ORDER BY day`
      )
      .all(...appParams);
    return success(res, rows.map((row) => ({ date: row.day, count: Number(row.count) })));
  });

  app.get("/api/analytics/status-distribution", loginRequired, (req, res) => {
    const { appWhere, appParams } = baseFilters(req);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT a.status, COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE ${appWhere} GROUP BY a.status`
      )
      .all(...appParams);
    const counts = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    // Include every status so charts stay stable, even with zero counts.
    return success(
      res,
      APPLICATION_STATUSES.map((status) => ({ status, count: counts[status] || 0 }))
    );
  });

  app.get("/api/analytics/jobs", loginRequired, (req, res) => {
    const { jobWhere, jobParams } = baseFilters(req);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT j.id, j.title, j.department, j.status,
                (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applications
         FROM jobs j WHERE ${jobWhere}
         ORDER BY applications DESC, j.created_at DESC LIMIT 20`
      )
      .all(...jobParams);
    return success(
      res,
      rows.map((row) => ({
        job_id: row.id,
        title: row.title,
        department: row.department,
        status: row.status,
        applications: Number(row.applications),
      }))
    );
  });

  // Frequency of detected skills across submitted resumes (matched skills).
  app.get("/api/analytics/skills", loginRequired, (req, res) => {
    const { appWhere, appParams } = baseFilters(req);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT a.resume_text, j.required_skills_json
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE ${appWhere}`
      )
      .all(...appParams);

    // Count how many resumes contain each required skill (case-insensitive).
    const frequency = new Map();
    for (const row of rows) {
      const textLower = String(row.resume_text || "").toLowerCase();
      let skills = [];
      try {
        skills = JSON.parse(row.required_skills_json || "[]");
      } catch {
        skills = [];
      }
      const seenInResume = new Set();
      for (const skill of skills) {
        const key = String(skill).toLowerCase();
        if (seenInResume.has(key)) continue;
        for (const term of synonymsFor(skill)) {
          if (containsTerm(textLower, term)) {
            frequency.set(key, (frequency.get(key) || 0) + 1);
            seenInResume.add(key);
            break;
          }
        }
      }
    }

    const data = [...frequency.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
      .slice(0, 25);
    return success(res, data);
  });
}
