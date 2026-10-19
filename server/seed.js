// Seed the database with a demo recruiter account and sample jobs.
//
// Usage (standalone):  npm run seed
// The server also calls seedIfEmpty() automatically on first start.
//
// Demo login (development only):
//   email:    recruiter@hiresense.dev
//   password: Recruiter@123
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, getDb } from "./db.js";
import { utcnowIso } from "./utils/helpers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

export const DEMO_EMAIL = "recruiter@hiresense.dev";
export const DEMO_PASSWORD = "Recruiter@123";

export const SAMPLE_JOBS = [
  {
    title: "Senior Frontend Engineer",
    department: "Engineering",
    location: "Remote",
    employment_type: "Full-time",
    experience_level: "Senior",
    description:
      "We are looking for a Senior Frontend Engineer to build polished, " +
      "accessible web interfaces. You will work with React, TypeScript, and " +
      "modern CSS, collaborate with designers, and own performance and " +
      "quality of the user experience. Strong communication skills and " +
      "experience with testing and CI/CD pipelines are valued.",
    required_skills: ["React", "TypeScript", "CSS", "HTML", "Testing", "REST", "Git"],
  },
  {
    title: "Backend Engineer",
    department: "Engineering",
    location: "Bengaluru",
    employment_type: "Full-time",
    experience_level: "Mid-level",
    description:
      "Join our platform team to design and build REST APIs in Node.js and " +
      "Express, model data in PostgreSQL, and ship reliable services with " +
      "Docker and CI/CD. You care about clean code, automated tests, and " +
      "observability.",
    required_skills: ["Node.js", "Express", "SQL", "PostgreSQL", "Docker", "REST", "Git"],
  },
  {
    title: "Data Science Intern",
    department: "Data",
    location: "Hybrid - Pune",
    employment_type: "Internship",
    experience_level: "Entry-level",
    description:
      "An internship for aspiring data scientists. You will explore " +
      "datasets, build simple statistical models with pandas and " +
      "scikit-learn, and communicate findings. Familiarity with SQL and " +
      "statistics is helpful.",
    required_skills: ["Pandas", "scikit-learn", "Statistics", "SQL", "Communication"],
  },
];

export function seed() {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM recruiters WHERE email = ?").get(DEMO_EMAIL);
  let recruiterId;

  if (existing !== undefined && existing !== null) {
    console.log(`Demo recruiter already exists: ${DEMO_EMAIL}`);
    recruiterId = existing.id;
  } else {
    const now = utcnowIso();
    const result = db
      .prepare(
        "INSERT INTO recruiters (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("Demo Recruiter", DEMO_EMAIL, bcrypt.hashSync(DEMO_PASSWORD, 10), now, now);
    recruiterId = Number(result.lastInsertRowid);
    db.prepare(
      "INSERT INTO recruiter_settings (recruiter_id, page_size, default_sort, updated_at) VALUES (?, 10, 'newest', ?)"
    ).run(recruiterId, now);
    console.log(`Created demo recruiter: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  const jobCount = Number(
    db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE recruiter_id = ?").get(recruiterId).c
  );
  if (jobCount) {
    console.log("Sample jobs already present; skipping job seed.");
  } else {
    const now = utcnowIso();
    for (const job of SAMPLE_JOBS) {
      db.prepare(
        `INSERT INTO jobs (recruiter_id, title, department, location,
               employment_type, experience_level, description,
               required_skills_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).run(
        recruiterId,
        job.title,
        job.department,
        job.location,
        job.employment_type,
        job.experience_level,
        job.description,
        JSON.stringify(job.required_skills),
        now,
        now
      );
    }
    console.log(`Seeded ${SAMPLE_JOBS.length} sample jobs.`);
  }
}

/** Seed only when the database has no recruiter yet (server auto-start path). */
export function seedIfEmpty() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS c FROM recruiters").get();
    if (Number(row.c) === 0) seed();
  } catch (err) {
    console.error("Auto-seed skipped:", err.message);
  }
}

// Allow `npm run seed` to run this module directly.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  initDb({
    databasePath: process.env.DATABASE_PATH || path.join(ROOT, "instance", "hiresense.db"),
    uploadFolder: process.env.UPLOAD_FOLDER || path.join(ROOT, "uploads"),
  });
  seed();
}
