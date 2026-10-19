// Server-side request validation helpers.
// Each returns a human-readable error string, or null when the input is valid.
import { isValidEmail } from "./helpers.js";

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];
export const EXPERIENCE_LEVELS = ["Entry-level", "Junior", "Mid-level", "Senior"];
export const JOB_STATUSES = ["open", "closed", "archived"];
export const APPLICATION_STATUSES = [
  "Applied",
  "Under Review",
  "Shortlisted",
  "Interview",
  "Hired",
  "Rejected",
];

export const JOB_SORTS = {
  newest: "created_at DESC",
  oldest: "created_at ASC",
  title_asc: "title ASC",
  title_desc: "title DESC",
};

export const APPLICATION_SORTS = {
  newest: "created_at DESC",
  oldest: "created_at ASC",
  score_desc: "match_score DESC, created_at DESC",
  score_asc: "match_score ASC, created_at DESC",
};

export const TITLE_MAX = 160;
export const DEPARTMENT_MAX = 120;
export const LOCATION_MAX = 160;
export const DESCRIPTION_MAX = 20000;
export const SKILL_MAX = 60;
export const MAX_SKILLS = 40;
export const NOTE_MAX = 4000;

/**
 * Validate a string field. Returns [value, error].
 */
export function requireString(data, field, { required = true, maxLength = null, allowEmpty = false } = {}) {
  let value = data == null ? undefined : data[field];
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) return [null, `'${field}' is required.`];
    return [typeof value === "string" ? value.trim() : value, null];
  }
  if (typeof value !== "string") return [null, `'${field}' must be text.`];
  value = value.trim();
  if (!allowEmpty && value === "") return [null, `'${field}' cannot be empty.`];
  if (maxLength !== null && value.length > maxLength) {
    return [null, `'${field}' must be at most ${maxLength} characters.`];
  }
  return [value, null];
}

/** Validate a job create/update body. Returns [cleaned, error]. */
export function validateJobPayload(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return [null, "Request body must be a JSON object."];
  }
  const cleaned = {};

  for (const [field, max] of [
    ["title", TITLE_MAX],
    ["department", DEPARTMENT_MAX],
    ["location", LOCATION_MAX],
  ]) {
    const [value, err] = requireString(data, field, { maxLength: max });
    if (err) return [null, err];
    cleaned[field] = value;
  }

  const [employmentType, etErr] = requireString(data, "employment_type");
  if (etErr) return [null, etErr];
  if (!EMPLOYMENT_TYPES.includes(employmentType)) {
    return [null, `'employment_type' must be one of: ${EMPLOYMENT_TYPES.join(", ")}.`];
  }
  cleaned.employment_type = employmentType;

  const [experienceLevel, elErr] = requireString(data, "experience_level");
  if (elErr) return [null, elErr];
  if (!EXPERIENCE_LEVELS.includes(experienceLevel)) {
    return [null, `'experience_level' must be one of: ${EXPERIENCE_LEVELS.join(", ")}.`];
  }
  cleaned.experience_level = experienceLevel;

  const [description, descErr] = requireString(data, "description", { maxLength: DESCRIPTION_MAX });
  if (descErr) return [null, descErr];
  cleaned.description = description;

  const raw = data.required_skills;
  let skills;
  if (raw === undefined || raw === null) {
    return [null, "'required_skills' is required."];
  } else if (typeof raw === "string") {
    skills = raw.split(",").map((s) => s.trim());
  } else if (Array.isArray(raw)) {
    skills = [];
    for (const item of raw) {
      if (typeof item !== "string") {
        return [null, "'required_skills' must contain only text values."];
      }
      skills.push(item.trim());
    }
  } else {
    return [null, "'required_skills' must be a list or comma-separated string."];
  }
  skills = skills.filter((s) => s !== "");
  if (skills.length === 0) return [null, "At least one required skill is needed."];
  if (skills.length > MAX_SKILLS) return [null, `At most ${MAX_SKILLS} required skills are allowed.`];
  for (const skill of skills) {
    if (skill.length > SKILL_MAX) {
      return [null, `Skill '${skill}' is too long (max ${SKILL_MAX} characters).`];
    }
  }
  // De-duplicate while preserving order, case-insensitively.
  const seen = new Set();
  const unique = [];
  for (const skill of skills) {
    const key = skill.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(skill);
    }
  }
  cleaned.required_skills = unique;

  return [cleaned, null];
}

/** Validate a job status value. Returns an error string or null. */
export function validateJobStatus(value) {
  if (typeof value !== "string" || !JOB_STATUSES.includes(value)) {
    return `'status' must be one of: ${JOB_STATUSES.join(", ")}.`;
  }
  return null;
}

export function validateApplicationStatus(value) {
  if (typeof value !== "string" || !APPLICATION_STATUSES.includes(value)) {
    return `'status' must be one of: ${APPLICATION_STATUSES.join(", ")}.`;
  }
  return null;
}

/** Validate the public candidate application form fields. */
export function validateCandidatePayload(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return [null, "Request body must be a JSON object."];
  }
  const cleaned = {};

  let [value, err] = requireString(data, "candidate_name", { maxLength: 160 });
  if (err) return [null, err];
  cleaned.candidate_name = value;

  [value, err] = requireString(data, "email", { maxLength: 254 });
  if (err) return [null, err];
  if (!isValidEmail(value)) return [null, "A valid email address is required."];
  cleaned.email = value.toLowerCase();

  [value, err] = requireString(data, "phone", { maxLength: 40 });
  if (err) return [null, err];
  const digits = [...value].filter((c) => /[0-9]/.test(c) || "+-() ".includes(c));
  if (digits.length < 7) return [null, "A valid phone number is required."];
  cleaned.phone = value;

  const portfolio = data.portfolio_url;
  if (portfolio === undefined || portfolio === null || (typeof portfolio === "string" && portfolio.trim() === "")) {
    cleaned.portfolio_url = null;
  } else {
    if (typeof portfolio !== "string") return [null, "'portfolio_url' must be a URL."];
    const trimmed = portfolio.trim();
    if (trimmed.length > 300) return [null, "'portfolio_url' is too long."];
    if (!trimmed.toLowerCase().startsWith("http://") && !trimmed.toLowerCase().startsWith("https://")) {
      return [null, "'portfolio_url' must start with http:// or https://."];
    }
    cleaned.portfolio_url = trimmed;
  }

  return [cleaned, null];
}

/** Return an error string for a weak password, else null. */
export function validatePassword(value) {
  if (typeof value !== "string") return "Password must be text.";
  if (value.length < 8) return "Password must be at least 8 characters long.";
  if (value.length > 128) return "Password must be at most 128 characters long.";
  return null;
}
