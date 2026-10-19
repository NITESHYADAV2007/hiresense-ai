// Fill the demo database with realistic open jobs so search, AI matching,
// and recommendations have meaningful data. Idempotent: only adds the
// difference up to the target (default 100 total jobs).
//
// Usage: npm run seed:jobs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, getDb } from "./db.js";
import { seed } from "./seed.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const ROLES = [
  { title: "Frontend Engineer", dept: "Engineering", skills: ["React", "TypeScript", "CSS", "HTML", "Testing", "REST", "Git"], summary: "Build polished, accessible interfaces and own frontend performance." },
  { title: "Backend Engineer", dept: "Engineering", skills: ["Node.js", "Express", "SQL", "PostgreSQL", "Docker", "REST", "Git"], summary: "Design reliable APIs and data models for high-traffic services." },
  { title: "Full-Stack Engineer", dept: "Engineering", skills: ["React", "Node.js", "TypeScript", "SQL", "REST", "Docker", "Git"], summary: "Ship features end to end, from database schema to user interface." },
  { title: "DevOps Engineer", dept: "Engineering", skills: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"], summary: "Automate delivery pipelines and keep infrastructure reproducible." },
  { title: "Platform Engineer", dept: "Engineering", skills: ["Kubernetes", "Docker", "AWS", "Go", "CI/CD", "Linux"], summary: "Build the internal platform other engineering teams deploy on." },
  { title: "Site Reliability Engineer", dept: "Engineering", skills: ["Linux", "Kubernetes", "AWS", "Monitoring", "CI/CD", "Python"], summary: "Improve reliability, observability, and incident response." },
  { title: "Security Engineer", dept: "Engineering", skills: ["Security", "AWS", "Python", "Linux", "Networking", "Cryptography"], summary: "Harden systems, review architecture, and respond to threats." },
  { title: "Mobile Engineer (iOS)", dept: "Engineering", skills: ["Swift", "iOS", "UIKit", "REST", "Git", "Testing"], summary: "Develop and ship native iOS experiences used by millions." },
  { title: "Mobile Engineer (Android)", dept: "Engineering", skills: ["Kotlin", "Android", "Java", "REST", "Git", "Testing"], summary: "Build fast, accessible Android applications." },
  { title: "QA Automation Engineer", dept: "Engineering", skills: ["Testing", "Automation", "Cypress", "JavaScript", "CI/CD", "SQL"], summary: "Own automated test coverage and release quality." },
  { title: "Engineering Manager", dept: "Engineering", skills: ["Leadership", "Agile", "Communication", "System Design", "Hiring"], summary: "Grow a healthy team and deliver complex technical projects." },
  { title: "Data Scientist", dept: "Data", skills: ["Python", "Pandas", "scikit-learn", "Statistics", "SQL", "Machine Learning"], summary: "Turn product and business data into models and decisions." },
  { title: "Data Analyst", dept: "Data", skills: ["SQL", "Excel", "Tableau", "Statistics", "Python", "Data Visualization"], summary: "Build dashboards and answer questions with rigorous analysis." },
  { title: "Machine Learning Engineer", dept: "Data", skills: ["Python", "PyTorch", "Machine Learning", "MLOps", "Docker", "SQL"], summary: "Take models from notebooks to reliable production services." },
  { title: "Data Engineer", dept: "Data", skills: ["Python", "SQL", "Airflow", "Spark", "AWS", "Data Warehousing"], summary: "Design pipelines and warehouses that teams can trust." },
  { title: "Analytics Engineer", dept: "Data", skills: ["SQL", "dbt", "Data Modeling", "BigQuery", "Python", "Git"], summary: "Model data in the warehouse and define trusted metrics." },
  { title: "NLP Engineer", dept: "Data", skills: ["Python", "NLP", "Transformers", "PyTorch", "Machine Learning", "SQL"], summary: "Build language models and text-processing systems." },
  { title: "Product Manager", dept: "Product", skills: ["Product Management", "Roadmap", "User Research", "Analytics", "Communication"], summary: "Own a product area from discovery through delivery." },
  { title: "Technical Product Manager", dept: "Product", skills: ["Product Management", "APIs", "SQL", "Agile", "Communication"], summary: "Translate developer needs into clear platform requirements." },
  { title: "Product Analyst", dept: "Product", skills: ["SQL", "Analytics", "A/B Testing", "Excel", "Communication"], summary: "Measure feature impact and guide product experiments." },
  { title: "Product Designer", dept: "Design", skills: ["Figma", "Prototyping", "User Research", "Design Systems", "Communication"], summary: "Design intuitive flows and maintain a coherent product language." },
  { title: "UX Researcher", dept: "Design", skills: ["User Research", "Interviews", "Usability Testing", "Figma", "Communication"], summary: "Run studies that reduce uncertainty about user needs." },
  { title: "UI Designer", dept: "Design", skills: ["Figma", "UI Design", "Prototyping", "Design Systems", "HTML", "CSS"], summary: "Craft visual systems and high-fidelity interface designs." },
  { title: "Growth Marketer", dept: "Marketing", skills: ["Marketing", "SEO", "Analytics", "Content", "A/B Testing", "Communication"], summary: "Run experiments that grow acquisition and activation." },
  { title: "Content Strategist", dept: "Marketing", skills: ["Content", "SEO", "Copywriting", "Marketing", "Communication"], summary: "Plan and produce content that earns attention and trust." },
  { title: "Account Executive", dept: "Sales", skills: ["Sales", "CRM", "Negotiation", "Communication", "B2B"], summary: "Own the full sales cycle for growing accounts." },
  { title: "Customer Success Manager", dept: "Customer Success", skills: ["Customer Success", "Communication", "CRM", "Onboarding", "Analytics"], summary: "Help customers reach outcomes and renew with confidence." },
  { title: "Operations Manager", dept: "Operations", skills: ["Operations", "Project Management", "Analytics", "Communication", "Excel"], summary: "Make cross-functional processes faster and more reliable." },
  { title: "Financial Analyst", dept: "Finance", skills: ["Finance", "Excel", "SQL", "Financial Modeling", "Accounting"], summary: "Build forecasts and support planning with clear analysis." },
  { title: "Recruiter", dept: "People", skills: ["Recruiting", "Communication", "Sourcing", "HR", "ATS"], summary: "Partner with hiring managers and run a thoughtful process." },
  { title: "HR Business Partner", dept: "People", skills: ["HR", "Communication", "Employee Relations", "Coaching"], summary: "Coach leaders and build a healthy employee experience." },
  { title: "Support Engineer", dept: "Customer Success", skills: ["Customer Support", "SQL", "REST", "Troubleshooting", "Communication"], summary: "Debug customer issues and turn them into product insight." },
  { title: "Solutions Engineer", dept: "Sales", skills: ["Sales", "SQL", "REST", "Communication", "APIs"], summary: "Design technical solutions and support the sales cycle." },
];

const PREFIXES = [
  { prefix: "", level: "Mid-level" },
  { prefix: "Senior ", level: "Senior" },
  { prefix: "Junior ", level: "Entry-level" },
  { prefix: "Lead ", level: "Lead" },
  { prefix: "Staff ", level: "Senior" },
];

const TEAMS = [
  "",
  " — Growth",
  " — Platform",
  " — Payments",
  " — Search",
  " — Identity",
  " — Core",
  " — Infrastructure",
  " — Developer Experience",
  " — Trust & Safety",
];

const LOCATIONS = [
  "Remote", "Bengaluru", "Mumbai", "Pune", "Hyderabad", "Delhi NCR",
  "Chennai", "New York", "Austin", "London", "Berlin", "Amsterdam",
  "Dublin", "Toronto", "Singapore", "Sydney",
];

function isoHoursAgo(hours) {
  const d = new Date(Date.now() - hours * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  );
}

function buildDescription(role, title, location, type) {
  const skills = role.skills.slice(0, 5).join(", ");
  const place =
    location === "Remote" ? "This is a fully remote role." : `This role is based in ${location}.`;
  const contract = type === "Contract" ? " This is a contract position." : "";
  return (
    `We are hiring a ${title} to join our ${role.dept} team. ${role.summary} ` +
    `You will work with ${skills} and collaborate closely with product, design, and engineering. ` +
    `${place}${contract}`
  );
}

/**
 * Add generated jobs until the database holds `target` jobs in total.
 * Returns the number of jobs added.
 */
export function seedJobsTo(target = 100) {
  const db = getDb();
  const recruiter = db
    .prepare("SELECT id FROM recruiters ORDER BY id LIMIT 1")
    .get();
  if (!recruiter) {
    console.error("No recruiter found. Run `npm run seed` first.");
    return 0;
  }

  const current = Number(db.prepare("SELECT COUNT(*) AS c FROM jobs").get().c);
  const needed = Math.max(0, target - current);
  if (needed === 0) {
    console.log(`Job seed: already ${current} jobs (target ${target}) — nothing to add.`);
    return 0;
  }

  const existingTitles = new Set(
    db.prepare("SELECT title FROM jobs").all().map((row) => row.title)
  );

  const insert = db.prepare(
    `INSERT INTO jobs (recruiter_id, title, department, location,
       employment_type, experience_level, description,
       required_skills_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  );

  let added = 0;
  let index = 0;
  let stop = false;

  outer: for (const team of TEAMS) {
    for (const seniority of PREFIXES) {
      for (const role of ROLES) {
        const title = `${seniority.prefix}${role.title}${team}`;
        if (existingTitles.has(title)) continue;

        const location = LOCATIONS[index % LOCATIONS.length];
        const type = index % 11 === 7 ? "Contract" : "Full-time";
        const createdAt = isoHoursAgo(added * 9 + 2);
        const description = buildDescription(role, title, location, type);

        insert.run(
          recruiter.id,
          title,
          role.dept,
          location,
          type,
          seniority.level,
          description,
          JSON.stringify(role.skills),
          createdAt,
          createdAt
        );

        existingTitles.add(title);
        added += 1;
        index += 1;
        if (added >= needed) {
          stop = true;
          break outer;
        }
      }
    }
  }

  console.log(
    `Job seed: added ${added} jobs (${current} -> ${current + added} total, target ${target}).`
  );
  return added;
}

// Allow `npm run seed:jobs` to run this module directly.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  initDb({
    databasePath: process.env.DATABASE_PATH || path.join(ROOT, "instance", "hiresense.db"),
    uploadFolder: process.env.UPLOAD_FOLDER || path.join(ROOT, "uploads"),
  });
  seed();
  seedJobsTo(Number(process.env.JOB_TARGET || 100));
}
