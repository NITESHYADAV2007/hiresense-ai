// End-to-end smoke test for the HireSense AI API.
//
// Usage:
//   1. Start the server:  npm start
//   2. In another terminal: npm run smoke   (or: node server/test/smoke.mjs)
//
// Exercises every endpoint group: auth, CSRF, jobs, public careers, resume
// upload + matching, applications workflow, dashboard, analytics, settings
// and CSV export.

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";

let cookies = [];
let csrf = null;
let passed = 0;
let failed = 0;

function check(name, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function cookieHeader() {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function captureCookies(res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const name = pair.split("=")[0];
    cookies = cookies.filter((c) => !c.startsWith(name + "="));
    cookies.push(pair);
  }
}

async function call(method, path, { json, form, headers = {} } = {}) {
  const opts = { method, headers: { ...headers }, redirect: "manual" };
  if (cookies.length) opts.headers["Cookie"] = cookieHeader();
  if (json !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(json);
  }
  if (form) opts.body = form;
  if (csrf) opts.headers["X-CSRF-Token"] = csrf;

  const res = await fetch(BASE + path, opts);
  captureCookies(res);

  let body = null;
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    body = await res.json();
  } else if (type.includes("text/csv")) {
    body = await res.text();
  } else {
    body = await res.text();
  }
  return { status: res.status, body };
}

// --- Minimal valid single-page PDF generator (for upload testing) ---
function makePdf(lines) {
  const escape = (s) => s.replace(/([\\()])/g, "\\$1");
  const content =
    "BT /F1 12 Tf 72 720 Td " +
    lines.map((l, i) => `${i ? "0 -16 Td " : ""}(${escape(l)}) Tj`).join(" ") +
    " ET";

  const objects = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    4: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };

  let out = "%PDF-1.4\n";
  const offsets = {};
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(out);
  out += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const RESUME_PDF = makePdf([
  "Jane Candidate",
  "jane.candidate@example.com | +1 555 010 2030",
  "",
  "Experience: 5 years building web applications.",
  "Skills: Node.js, Express, SQL, PostgreSQL, Docker, REST APIs, Git,",
  "CI/CD pipelines, automated testing, communication skills.",
]);

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // --- Health ---
  console.log("Health");
  const health = await call("GET", "/health");
  check("GET /health -> 200 ok", health.status === 200 && health.body?.data?.status === "ok");
  check(
    "GET /health -> AI status",
    typeof health.body?.data?.ai?.enabled === "boolean" && "model" in (health.body?.data?.ai || {})
  );

  // --- Auth ---
  console.log("\nAuth");
  const badLogin = await call("POST", "/api/auth/login", {
    json: { email: "recruiter@hiresense.dev", password: "wrong-password" },
  });
  check("login with bad password -> 401", badLogin.status === 401 && badLogin.body?.error);

  const login = await call("POST", "/api/auth/login", {
    json: { email: "recruiter@hiresense.dev", password: "Recruiter@123" },
  });
  check("login with demo account -> 200", login.status === 200 && login.body?.data?.name);
  csrf = login.body?.data?.csrf_token;
  check("login returns csrf token", typeof csrf === "string" && csrf.length > 10);

  const me = await call("GET", "/api/auth/me");
  check("GET /api/auth/me -> recruiter", me.status === 200 && me.body?.data?.email === "recruiter@hiresense.dev");

  // CSRF enforcement: change state without the header.
  const saved = csrf;
  csrf = null;
  const noCsrf = await call("POST", "/api/jobs", {
    json: { title: "x", department: "x", location: "x", employment_type: "Full-time", experience_level: "Senior", description: "x", required_skills: ["x"] },
  });
  check("POST without CSRF -> 403", noCsrf.status === 403);
  csrf = saved;

  // --- Jobs ---
  console.log("\nJobs");
  const jobs = await call("GET", "/api/jobs");
  check("GET /api/jobs -> seeded jobs", jobs.status === 200 && Array.isArray(jobs.body?.data) && jobs.body.data.length >= 3);
  check("jobs include applicant_count", typeof jobs.body?.data?.[0]?.applicant_count === "number");
  check("jobs include required_skills array", Array.isArray(jobs.body?.data?.[0]?.required_skills));

  const created = await call("POST", "/api/jobs", {
    json: {
      title: "QA Automation Engineer",
      department: "Engineering",
      location: "Remote",
      employment_type: "Full-time",
      experience_level: "Mid-level",
      description: "Own the automated test suites and quality processes.",
      required_skills: ["Testing", "Node.js", "CI/CD"],
    },
  });
  check("POST /api/jobs -> 201", created.status === 201 && created.body?.data?.id);
  const jobId = created.body?.data?.id;

  const updated = await call("PUT", `/api/jobs/${jobId}`, {
    json: {
      title: "QA Automation Engineer (II)",
      department: "Engineering",
      location: "Remote",
      employment_type: "Full-time",
      experience_level: "Mid-level",
      description: "Own the automated test suites and quality processes.",
      required_skills: ["Testing", "Node.js", "CI/CD"],
    },
  });
  check("PUT /api/jobs/:id -> updated title", updated.status === 200 && updated.body?.data?.title.includes("(II)"));

  const closed = await call("PATCH", `/api/jobs/${jobId}/status`, { json: { status: "closed" } });
  check("PATCH job status -> closed", closed.status === 200 && closed.body?.data?.status === "closed");
  const publicBefore = await call("GET", "/api/public/jobs?per_page=50");
  check("closed job hidden from public list", !publicBefore.body?.data?.some((j) => j.id === jobId));
  await call("PATCH", `/api/jobs/${jobId}/status`, { json: { status: "open" } });

  const meta = await call("GET", "/api/jobs/meta");
  check("GET /api/jobs/meta -> departments", meta.status === 200 && Array.isArray(meta.body?.data?.departments));

  // --- Public careers + application ---
  console.log("\nPublic portal + resume upload");
  const publicJobs = await call("GET", "/api/public/jobs");
  check("GET /api/public/jobs -> open jobs", publicJobs.status === 200 && publicJobs.body?.data?.length >= 3);
  check("public job has no recruiter_id", publicJobs.body?.data?.[0]?.recruiter_id === undefined);
  check("public job has description_preview", "description_preview" in (publicJobs.body?.data?.[0] || {}));

  const filters = await call("GET", "/api/public/jobs/filters");
  check("GET /api/public/jobs/filters", filters.status === 200 && Array.isArray(filters.body?.data?.employment_types));

  // --- AI recommendations + candidate profile (public) ---
  console.log("\nAI recommendations + candidate profile");
  const recEmpty = await call("POST", "/api/public/recommendations", { form: new FormData() });
  check("recommendations without a resume -> 400", recEmpty.status === 400);

  const recForm = new FormData();
  recForm.append("resume", new Blob([RESUME_PDF], { type: "application/pdf" }), "jane_resume.pdf");
  recForm.append("limit", "5");
  const rec = await call("POST", "/api/public/recommendations", { form: recForm });
  check(
    "POST /api/public/recommendations -> ranked jobs",
    rec.status === 200 &&
      Array.isArray(rec.body?.data?.results) &&
      rec.body.data.results.length > 0 &&
      rec.body.data.results.length <= 5
  );
  check(
    "recommendations expose the AI engine",
    ["embeddings", "tfidf"].includes(rec.body?.data?.engine)
  );
  check(
    "recommendations include a numeric score",
    typeof rec.body?.data?.results?.[0]?.match_score === "number"
  );
  check(
    "recommendations are sorted by score",
    rec.body?.data?.results?.every(
      (item, index, list) => index === 0 || list[index - 1].match_score >= item.match_score
    )
  );

  const candidateEmail = `jane.${Date.now().toString(36)}@example.com`;
  const profileForm = new FormData();
  profileForm.append("name", "Jane Candidate");
  profileForm.append("email", candidateEmail);
  profileForm.append("phone", "+1 555 010 2030");
  profileForm.append(
    "resume",
    new Blob([RESUME_PDF], { type: "application/pdf" }),
    "jane_resume.pdf"
  );
  const profile = await call("POST", "/api/public/candidate/profile", { form: profileForm });
  check(
    "create candidate profile -> 201",
    profile.status === 201 && Boolean(profile.body?.data?.candidate?.id)
  );
  check(
    "candidate response excludes resume text/path",
    profile.body?.data?.candidate?.resume_text === undefined &&
      profile.body?.data?.candidate?.resume_storage_path === undefined
  );

  const profileMe = await call("GET", "/api/public/candidate/me");
  check(
    "candidate me -> profile",
    profileMe.status === 200 && profileMe.body?.data?.candidate?.email === candidateEmail
  );

  const candidateMatches = await call("GET", "/api/public/candidate/matches?limit=5");
  check(
    "candidate matches -> ranked",
    candidateMatches.status === 200 && candidateMatches.body?.data?.results?.length === 5
  );
  check(
    "candidate matches expose the AI engine",
    ["embeddings", "tfidf"].includes(candidateMatches.body?.data?.engine)
  );

  const form = new FormData();
  form.append("candidate_name", "Jane Candidate");
  form.append("email", candidateEmail);
  form.append("phone", "+1 555 010 2030");
  form.append("portfolio_url", "https://example.com/jane");
  form.append("resume", new Blob([RESUME_PDF], { type: "application/pdf" }), "jane_resume.pdf");

  const applied = await call("POST", `/api/public/jobs/${jobId}/applications`, { form });
  check("POST application with PDF -> 201", applied.status === 201 && applied.body?.data?.public_reference);
  const reference = applied.body?.data?.public_reference;

  const confirmation = await call("GET", `/api/public/applications/${reference}`);
  check("public confirmation lookup", confirmation.status === 200 && confirmation.body?.data?.job_title);

  const profileAfterApply = await call("GET", "/api/public/candidate/me");
  check(
    "application linked to the candidate profile",
    profileAfterApply.status === 200 &&
      profileAfterApply.body?.data?.applications?.some(
        (app) => app.public_reference === reference
      )
  );

  const profileUpdateForm = new FormData();
  profileUpdateForm.append("name", "Jane Candidate");
  profileUpdateForm.append("email", candidateEmail);
  profileUpdateForm.append("phone", "+1 555 010 2030");
  const profileUpdate = await call("POST", "/api/public/candidate/profile", {
    form: profileUpdateForm,
  });
  check(
    "profile update without a new resume -> 200",
    profileUpdate.status === 200 &&
      profileUpdate.body?.data?.candidate?.resume_original_filename === "jane_resume.pdf"
  );

  const noResume = new FormData();
  noResume.append("candidate_name", "No Resume");
  noResume.append("email", "no.resume@example.com");
  noResume.append("phone", "+1 555 000 0000");
  const missing = await call("POST", `/api/public/jobs/${jobId}/applications`, { form: noResume });
  check("application without resume -> 400", missing.status === 400);

  // Public endpoints must keep working when a recruiter is signed in on the
  // same browser (they never act on session privileges, so no CSRF header).
  const savedCsrf = csrf;
  csrf = null;
  const publicForm = new FormData();
  publicForm.append("candidate_name", "Public Applicant");
  publicForm.append("email", "public.applicant@example.com");
  publicForm.append("phone", "+1 555 222 3333");
  publicForm.append("resume", new Blob([RESUME_PDF], { type: "application/pdf" }), "public.pdf");
  const publicNoCsrf = await call("POST", `/api/public/jobs/${jobId}/applications`, { form: publicForm });
  check("public apply without CSRF header -> 201", publicNoCsrf.status === 201);
  csrf = savedCsrf;

  // --- Applications workflow ---
  console.log("\nApplications");
  const apps = await call("GET", "/api/applications");
  check("GET /api/applications -> includes new app", apps.status === 200 && apps.body?.data?.some((a) => a.public_reference === reference));
  const appRow = apps.body?.data?.find((a) => a.public_reference === reference);
  check("application has match_score", typeof appRow?.match_score === "number" && appRow.match_score > 0, `(score=${appRow?.match_score})`);
  check("application has job_title", typeof appRow?.job_title === "string");
  const appId = appRow?.id;

  const detail = await call("GET", `/api/applications/${appId}`);
  check("GET application detail -> notes/history/match", detail.status === 200 && Array.isArray(detail.body?.data?.notes) && Array.isArray(detail.body?.data?.status_history) && detail.body?.data?.match);
  check("detail includes resume preview", typeof detail.body?.data?.resume_text_preview === "string" && detail.body?.data?.resume_text_length > 40);
  check("detail has job_required_skills", Array.isArray(detail.body?.data?.job_required_skills));
  check("detail hides storage path", detail.body?.data?.resume_storage_path === undefined);

  const reanalyze = await call("POST", `/api/applications/${appId}/analyze`);
  check("POST reanalyze -> 201 with skills", reanalyze.status === 201 && Array.isArray(reanalyze.body?.data?.matched_skills));
  check(
    "reanalyze records the AI engine",
    ["embeddings", "tfidf"].includes(reanalyze.body?.data?.engine)
  );

  const statusChange = await call("PATCH", `/api/applications/${appId}/status`, { json: { status: "Shortlisted" } });
  check("PATCH status -> Shortlisted", statusChange.status === 200 && statusChange.body?.data?.status === "Shortlisted");

  const note = await call("POST", `/api/applications/${appId}/notes`, { json: { note: "Great communication skills." } });
  check("POST note -> 201", note.status === 201 && note.body?.data?.recruiter_name);

  const match = await call("GET", `/api/applications/${appId}/match`);
  check("GET match -> scores", match.status === 200 && typeof match.body?.data?.similarity_score === "number");

  const grouped = await call("GET", "/api/applications?group_by=status");
  check("group_by=status -> all buckets", grouped.status === 200 && "Applied" in (grouped.body?.data || {}) && grouped.body?.data?.Shortlisted?.length >= 1);

  const csv = await call("GET", "/api/applications/export");
  check("CSV export includes candidate", csv.status === 200 && csv.body.includes("Jane Candidate"));

  const resumeDownload = await call("GET", `/api/applications/${appId}/resume`);
  check("resume download -> PDF", resumeDownload.status === 200 && String(resumeDownload.body).startsWith("%PDF-"));

  // --- Dashboard / analytics ---
  console.log("\nDashboard + analytics");
  const summary = await call("GET", "/api/dashboard/summary");
  check("GET dashboard summary", summary.status === 200 && summary.body?.data?.total_applications >= 1 && Array.isArray(summary.body?.data?.recent_jobs));

  const trends = await call("GET", "/api/dashboard/trends");
  check("GET dashboard trends -> 30 days", trends.status === 200 && trends.body?.data?.series?.length === 30);

  const aSummary = await call("GET", "/api/analytics/summary");
  check("analytics summary", aSummary.status === 200 && aSummary.body?.data?.applications_received >= 1);

  const overTime = await call("GET", "/api/analytics/applications-over-time");
  check("analytics applications-over-time", overTime.status === 200 && Array.isArray(overTime.body?.data));

  const dist = await call("GET", "/api/analytics/status-distribution");
  check("analytics status-distribution -> 6 statuses", dist.status === 200 && dist.body?.data?.length === 6);

  const byJob = await call("GET", "/api/analytics/jobs");
  check("analytics jobs ranking", byJob.status === 200 && Array.isArray(byJob.body?.data));

  const skills = await call("GET", "/api/analytics/skills");
  check("analytics skills frequency", skills.status === 200 && skills.body?.data?.some((s) => s.skill === "testing"));

  // --- Settings ---
  console.log("\nSettings");
  const settings = await call("GET", "/api/settings");
  check("GET settings", settings.status === 200 && settings.body?.data?.page_size === 10);
  const settingsUpdate = await call("PUT", "/api/settings", { json: { display_name: "Demo Recruiter", page_size: 20, default_sort: "score_desc" } });
  check("PUT settings -> updated", settingsUpdate.status === 200 && settingsUpdate.body?.data?.page_size === 20 && settingsUpdate.body?.data?.default_sort === "score_desc");
  await call("PUT", "/api/settings", { json: { page_size: 10, default_sort: "newest" } });

  // --- Cleanup (delete app + job) ---
  console.log("\nCleanup");
  const delApp = await call("DELETE", `/api/applications/${appId}`);
  check("DELETE application", delApp.status === 200);
  const gone = await call("GET", `/api/applications/${appId}`);
  check("deleted application -> 404", gone.status === 404);
  const delJob = await call("DELETE", `/api/jobs/${jobId}`);
  check("DELETE job", delJob.status === 200);

  // --- Pages + fallbacks ---
  console.log("\nPages + fallbacks");
  const index = await call("GET", "/");
  check("GET / -> HTML page", index.status === 200 && String(index.body).includes("<html"));
  const careerDetail = await call("GET", "/careers/1");
  check("GET /careers/1 -> detail page", careerDetail.status === 200 && String(careerDetail.body).includes("<html"));
  const profilePage = await call("GET", "/profile");
  check("GET /profile -> HTML page", profilePage.status === 200 && String(profilePage.body).includes("<html"));
  const api404 = await call("GET", "/api/nope");
  check("unknown /api -> JSON 404", api404.status === 404 && api404.body?.error === "Resource not found.");

  // --- Logout ---
  const logout = await call("POST", "/api/auth/logout");
  check("logout", logout.status === 200);
  const afterLogout = await call("GET", "/api/applications");
  check("after logout -> 401", afterLogout.status === 401);

  const candidateLogout = await call("POST", "/api/public/candidate/logout");
  check("candidate profile logout", candidateLogout.status === 200);
  const candidateAfterLogout = await call("GET", "/api/public/candidate/me");
  check(
    "candidate after logout -> null",
    candidateAfterLogout.status === 200 && candidateAfterLogout.body?.data === null
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
