// Authentication helpers: current recruiter lookup, login guard middleware.
import { getDb, rowToDict } from "./db.js";
import { ensureCsrfToken } from "./session.js";
import { fail } from "./utils/responses.js";

/** Return the logged-in recruiter row as a dict, or null. */
export function currentRecruiter(req) {
  const recruiterId = req.session.data.recruiter_id;
  if (!recruiterId) return null;
  if (req._recruiterCache !== undefined) return req._recruiterCache;
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, email, created_at, updated_at FROM recruiters WHERE id = ?")
    .get(recruiterId);
  if (row === undefined || row === null) {
    req.session.clear();
    req._recruiterCache = null;
    return null;
  }
  req._recruiterCache = rowToDict(row);
  return req._recruiterCache;
}

/** Express middleware: reject unauthenticated clients with 401. */
export function loginRequired(req, res, next) {
  const recruiter = currentRecruiter(req);
  if (recruiter === null) {
    return fail(res, "You must be signed in to access this resource.", 401);
  }
  req.recruiter = recruiter;
  return next();
}

/** Log a recruiter in by establishing a signed session. Returns CSRF token. */
export function startRecruiterSession(req, recruiter) {
  req.session.clear();
  req.session.set("recruiter_id", recruiter.id);
  return ensureCsrfToken(req);
}
