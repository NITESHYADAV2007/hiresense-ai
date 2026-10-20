// HireSense AI server: Express app that serves the static frontend and the
// /api endpoints (Node.js port of the former Flask backend).
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initDb, closeDb } from "./db.js";
import { sessionMiddleware, csrfProtect } from "./session.js";
import { fail, success } from "./utils/responses.js";

import { authRoutes } from "./routes/auth.js";
import { jobsRoutes } from "./routes/jobs.js";
import { publicRoutes } from "./routes/public.js";
import { candidateRoutes } from "./routes/candidate.js";
import { applicationsRoutes } from "./routes/applications.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { settingsRoutes } from "./routes/settings.js";
import { seedIfEmpty } from "./seed.js";
import { embeddingStatus, warmup as warmEmbeddings } from "./services/embeddings.js";
import { warmJobVectors } from "./services/recommend.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");

const config = {
  port: Number(process.env.PORT || 3000),
  secretKey: process.env.SECRET_KEY || "dev-secret-change-me",
  databasePath: process.env.DATABASE_PATH || path.join(ROOT, "instance", "hiresense.db"),
  uploadFolder: process.env.UPLOAD_FOLDER || path.join(ROOT, "uploads"),
  sessionSecure: process.env.SESSION_COOKIE_SECURE === "1",
};

// Map each application route to its static HTML file.
const PAGE_ROUTES = {
  "/": "index.html",
  "/login": "login.html",
  "/signup": "signup.html",
  "/dashboard": "dashboard.html",
  "/jobs": "jobs.html",
  "/jobs/new": "job-form.html",
  "/careers": "careers.html",
  "/profile": "candidate-profile.html",
  "/candidates": "candidates.html",
  "/pipeline": "pipeline.html",
  "/analytics": "analytics.html",
  "/settings": "settings.html",
};

const app = express();
app.disable("x-powered-by");
// Render terminates TLS at its proxy; trust exactly one hop so req.ip (used by
// the public rate limiters) reflects the real client. Only opt in via env.
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use(sessionMiddleware(config.secretKey, { secure: config.sessionSecure }));
app.use(express.json({ limit: "1mb" }));

// CSRF protection for the API (public candidate endpoints are exempt because
// they are unauthenticated; they are protected by rate limiting instead).
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const message = csrfProtect(req);
  if (message !== null) return fail(res, message, 403);
  return next();
});

// --- API routes ---
app.get("/health", (req, res) =>
  success(res, { status: "ok", ai: embeddingStatus() })
);
authRoutes(app);
jobsRoutes(app);
publicRoutes(app, { uploadFolder: config.uploadFolder });
candidateRoutes(app, { uploadFolder: config.uploadFolder });
applicationsRoutes(app, { uploadFolder: config.uploadFolder });
dashboardRoutes(app);
analyticsRoutes(app);
settingsRoutes(app);

// --- Frontend page serving ---
function servePage(res, filename, status = 200) {
  const pagePath = path.join(FRONTEND_DIR, filename);
  if (!fs.existsSync(pagePath)) {
    return fail(res, "Page not found.", status);
  }
  res.status(status).sendFile(pagePath);
}

app.use((req, res, next) => {
  const urlPath = req.path.replace(/^\/+/, "");

  // API 404s are handled by the JSON fallback below; never serve pages for /api.
  if (urlPath.startsWith("api/")) return next();

  // Static assets: js/*, css/*, assets/*
  if (/^(js|css|assets)\//.test(urlPath)) {
    const target = path.resolve(FRONTEND_DIR, urlPath);
    const inside = target.startsWith(path.resolve(FRONTEND_DIR) + path.sep);
    if (inside && fs.existsSync(target) && fs.statSync(target).isFile()) {
      return res.sendFile(target);
    }
    return fail(res, "Asset not found.", 404);
  }

  if (req.method !== "GET" && req.method !== "HEAD") return next();

  if (urlPath === "") return servePage(res, "index.html");

  const route = "/" + urlPath;
  if (route in PAGE_ROUTES) return servePage(res, PAGE_ROUTES[route]);

  // /jobs/<id>, /jobs/<id>/edit, /careers/<id>, /apply/<jobId>,
  // /application-success/<ref>, /candidates/<id>, /candidates/<id>/match
  const parts = urlPath.split("/").filter(Boolean);
  try {
    if (parts.length === 2 && ["jobs", "careers", "apply", "candidates"].includes(parts[0]) && /^\d+$/.test(parts[1])) {
      const mapping = {
        jobs: "job-detail.html",
        careers: "career-detail.html",
        apply: "apply.html",
        candidates: "candidate-detail.html",
      };
      return servePage(res, mapping[parts[0]]);
    }
    if (parts.length === 3 && parts[0] === "jobs" && /^\d+$/.test(parts[1]) && parts[2] === "edit") {
      return servePage(res, "job-form.html");
    }
    if (parts.length === 3 && parts[0] === "candidates" && /^\d+$/.test(parts[1]) && parts[2] === "match") {
      return servePage(res, "candidate-match.html");
    }
    if (parts.length === 2 && parts[0] === "application-success" && parts[1]) {
      return servePage(res, "application-success.html");
    }
  } catch {
    /* fall through to 404 */
  }

  return servePage(res, "404.html", 404);
});

// --- Error handling ---

// Unknown API routes keep the JSON error shape.
app.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return fail(res, "Resource not found.", 404);
  }
  return fail(res, "Page not found.", 404);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return fail(res, "The uploaded file is too large (max 5 MB).", 413);
    }
    return fail(res, err.message || "The upload could not be processed.", 400);
  }
  if (err && err.type === "entity.too.large") {
    return fail(res, "The uploaded file is too large (max 5 MB).", 413);
  }
  if (err && err.type === "entity.parse.failed") {
    return fail(res, "Request body must be JSON.", 400);
  }
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  return fail(res, "An unexpected server error occurred.", 500);
});

// --- Startup ---
initDb(config);
seedIfEmpty();
warmEmbeddings(); // load the local model in the background
// Cache vectors for every open job so the first AI request is fast (and the
// free Render instance has them ready after a cold start).
warmJobVectors()
  .then((count) => {
    if (count > 0) console.log(`[embeddings] cached ${count} job vectors.`);
  })
  .catch((err) => console.error(`[embeddings] job warmup failed: ${err.message}`));

const server = app.listen(config.port, () => {
  console.log("");
  console.log("  HireSense AI is running");
  console.log(`  ➜  http://localhost:${config.port}`);
  console.log("");
  console.log("  Demo login: recruiter@hiresense.dev / Recruiter@123");
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  });
}

export default app;
