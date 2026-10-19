// Recruiter settings endpoints.
import bcrypt from "bcryptjs";
import { getDb } from "../db.js";
import { loginRequired } from "../auth.js";
import { ensureSettings } from "../services/application.js";
import { isValidEmail, utcnowIso } from "../utils/helpers.js";
import { success, fail } from "../utils/responses.js";
import { APPLICATION_SORTS, requireString, validatePassword } from "../utils/validators.js";

const ALLOWED_PAGE_SIZES = [10, 20, 25, 50, 100];

function settingsPayload(recruiter, settings) {
  return {
    display_name: recruiter.name,
    email: recruiter.email,
    page_size: settings.page_size,
    default_sort: settings.default_sort,
    privacy: {
      data_retention:
        "Candidate details, resume files, and extracted resume text are " +
        "stored so recruiters can evaluate applications. They are removed " +
        "when an application or job is deleted by a recruiter.",
      secure_resume_access:
        "Resume files are stored outside the web root and are only " +
        "downloadable by authenticated recruiters who own the job.",
      deletion_process:
        "To request deletion of a candidate record, a recruiter can " +
        "delete the application from the candidate profile. Contact the " +
        "site administrator to remove uploaded resume files permanently.",
    },
  };
}

export function settingsRoutes(app) {
  app.get("/api/settings", loginRequired, (req, res) => {
    const settings = ensureSettings(req.recruiter.id);
    return success(res, settingsPayload(req.recruiter, settings));
  });

  app.put("/api/settings", loginRequired, (req, res) => {
    if (req.is("application/json") !== "application/json") {
      return fail(res, "Request body must be JSON.");
    }
    const data = req.body || {};
    const db = getDb();
    const rid = req.recruiter.id;

    if ("display_name" in data || "email" in data) {
      if ("display_name" in data) {
        const [name, err] = requireString(data, "display_name", { maxLength: 120 });
        if (err) return fail(res, err);
        db.prepare("UPDATE recruiters SET name = ?, updated_at = ? WHERE id = ?").run(
          name,
          utcnowIso(),
          rid
        );
        req.recruiter.name = name;
      }
      if ("email" in data) {
        const [email, err] = requireString(data, "email", { maxLength: 254 });
        if (err) return fail(res, err);
        if (!isValidEmail(email)) return fail(res, "A valid email address is required.");
        const existing = db
          .prepare("SELECT id FROM recruiters WHERE email = ? AND id != ?")
          .get(email.toLowerCase(), rid);
        if (existing !== undefined && existing !== null) {
          return fail(res, "That email address is already in use.", 409);
        }
        db.prepare("UPDATE recruiters SET email = ?, updated_at = ? WHERE id = ?").run(
          email.toLowerCase(),
          utcnowIso(),
          rid
        );
        req.recruiter.email = email.toLowerCase();
      }
    }

    const pageSize = data.page_size;
    const defaultSort = data.default_sort;
    let size = null;
    if (pageSize !== undefined && pageSize !== null) {
      size = Number.parseInt(pageSize, 10);
      if (Number.isNaN(size)) return fail(res, "'page_size' must be an integer.");
      if (!ALLOWED_PAGE_SIZES.includes(size)) {
        return fail(res, `'page_size' must be one of: ${ALLOWED_PAGE_SIZES.join(", ")}.`);
      }
    }
    if (defaultSort !== undefined && defaultSort !== null) {
      if (!(defaultSort in APPLICATION_SORTS)) {
        return fail(
          res,
          `'default_sort' must be one of: ${Object.keys(APPLICATION_SORTS).join(", ")}.`
        );
      }
    }

    const settings = ensureSettings(rid);
    db.prepare(
      "UPDATE recruiter_settings SET page_size = ?, default_sort = ?, updated_at = ? WHERE id = ?"
    ).run(
      size !== null ? size : settings.page_size,
      defaultSort !== undefined && defaultSort !== null ? defaultSort : settings.default_sort,
      utcnowIso(),
      settings.id
    );

    const updated = ensureSettings(rid);
    return success(res, settingsPayload(req.recruiter, updated));
  });
}
