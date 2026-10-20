# HireSense AI

An AI-assisted recruitment platform: recruiters post jobs and review candidates,
while candidates browse roles, upload a resume, get AI-ranked job matches, and
apply — all from one Node.js app.

Built with **Node.js + Express**, **SQLite** (`node:sqlite`), and a **vanilla
HTML/CSS/JS** frontend. No Python, no bundler, no external AI API key.

## Live demo

**https://hiresense-ai-production-56b9.up.railway.app**

Deployed on Railway; source code on GitHub at
[niteshyadav2007/hiresense-ai](https://github.com/niteshyadav2007/hiresense-ai).

---

## Features

**Public careers site**

- 100 realistic demo jobs with search, department/location/type filters, and pagination
- Upload a PDF resume and get **up to 100 AI-ranked job matches** — no account needed
- Apply in minutes with an opaque confirmation reference
- Responsive, accessible UI with light/dark themes

**Candidate accounts**

- Email + password signup and login; resumes and profiles are stored per account
- Upload a resume once and get AI-ranked job matches with required-skill overlap
- Every application submitted while signed in (or with the same email) is linked to
  the account and appears under **My applications** with its live status
- Update your details or replace your resume; sign out and back in from any device
- Guest resume matching on the careers page still works without an account

**Recruiter workspace**

- Recruiter self-signup with email + password; each account gets an isolated workspace
- Dashboard with live metrics, 30-day application trend, and status donut
- Job management: create, edit, open/close, delete, required-skill tags
- Candidate pipeline (Applied → Under Review → Shortlisted → Interview → Hired/Rejected)
- Candidate detail: resume preview, AI match explanation, notes, status history
- Analytics: applications over time, status distribution, per-job ranking, skills
- CSV export, resume download, settings, command palette (`Ctrl+K`), toasts

**Matching engine** (decision support only)

- **Semantic AI**: local [`Xenova/all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
  embeddings via Transformers.js, cosine similarity, calibrated to 0–100
- Blended with required-skill coverage and a transparent title/seniority signal
- Job vectors cached in SQLite; embeddings run locally with no API key or per-request cost
- Automatic **TF-IDF fallback** when embeddings are disabled or unavailable
- Scores never auto-reject anyone; every candidate is reviewed by a human

---

## Requirements

- **Node.js 22.5+** (uses the built-in `node:sqlite` module)
- npm

```bash
node --version   # v22.5.0 or newer
```

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000**.

On first start the app seeds the demo recruiter and **100 open jobs** (the
`prestart` script is idempotent). The first AI request downloads the ~25 MB
MiniLM model into `.cache/transformers` and then runs fully offline.

Demo recruiter login:

| Email                     | Password        |
| ------------------------- | --------------- |
| `recruiter@hiresense.dev` | `Recruiter@123` |

Applicants can create their own account at **/signup?role=applicant**. Recruiter
self-signup is available at **/signup?role=recruiter** when
`ENABLE_REGISTRATION=1` (enabled on the live demo).

## Scripts

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm start`         | Seed up to 100 jobs, then start the server on port 3000       |
| `npm run dev`       | Same, with auto-restart on file changes                       |
| `npm run seed`      | Create the demo account and the 3 original sample jobs        |
| `npm run seed:jobs` | Add generated jobs until the database has 100 jobs (idempotent) |
| `npm run smoke`     | 84-check end-to-end API test (run while the server is up)      |

## Environment variables

All optional — defaults work locally.

| Variable                | Default                 | Purpose                                                     |
| ----------------------- | ----------------------- | ----------------------------------------------------------- |
| `PORT`                  | `3000`                  | HTTP port                                                   |
| `SECRET_KEY`            | dev value               | Signs session cookies — **set in production**               |
| `DATABASE_PATH`         | `instance/hiresense.db` | SQLite database file                                        |
| `UPLOAD_FOLDER`         | `uploads/`              | Uploaded resume PDFs                                        |
| `SESSION_COOKIE_SECURE` | off                     | Set to `1` when serving over HTTPS                          |
| `TRUST_PROXY`           | off                     | Set to `1` behind Render/most PaaS proxies (correct `req.ip`) |
| `ENABLE_REGISTRATION`   | off                     | Set to `1` to enable recruiter self-registration (applicant signup is always on) |
| `EMBEDDINGS`            | `local`                 | Set to `off` to force the TF-IDF fallback                    |
| `EMBEDDING_MODEL`       | `Xenova/all-MiniLM-L6-v2` | Swap in another Transformers.js embedding model           |

Generate a production secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## AI matching details

For each open job, the engine embeds:

```
title + department + experience level + description + required skills
```

The resume text is embedded with the same model. The raw cosine similarity is
calibrated to a 0–100 score, blended 80/20 with required-skill coverage, then
adjusted by a small title/seniority signal (for example, an exact
"Senior Frontend Engineer" headline match, or a penalty for junior roles when
the resume shows 7 years of experience). Job vectors are cached in the
`job_embeddings` table and refreshed when a job is edited.

This is deliberately explainable decision-support, not an auto-hiring system.
It does not understand context, seniority nuances, or every synonym, and it
should always be paired with human review.

## Accounts and privacy

Applicants create an email + password account. Passwords are hashed with bcrypt
and the signed, HTTP-only session cookie stores only the `candidate_id`. Resume
text is used for matching and is never returned by the API; the public profile
response also strips `password_hash`, storage paths, and resume text.

Recruiters have a separate account system. Registration is gated by
`ENABLE_REGISTRATION=1` and rate-limited. Every job, application, dashboard, and
analytics query is scoped to the signed-in `recruiter_id`, so two recruiter
accounts cannot see each other's records.

Applications are linked to an account when the candidate is signed in and the
application email matches the account email. Earlier guest applications with the
same email are attached on the next login or signup. Recruiters never see the
candidate session cookie.

For a production system you would add email verification, password reset, and a
shared rate-limit store; the current implementation is deliberately scoped to a
single-instance internship demo.

## Project structure

```
.
├── server/
│   ├── server.js              # Express app, middleware, page routes, startup
│   ├── db.js                  # SQLite + schema migrations
│   ├── schema.sql             # Tables: recruiters, jobs, candidates, applications…
│   ├── seed.js                # Demo recruiter + original sample jobs
│   ├── seed_jobs.js           # Generates realistic jobs up to 100 total
│   ├── routes/                # auth, jobs, public, candidate, applications,
│   │                          # dashboard, analytics, settings
│   ├── services/
│   │   ├── embeddings.js      # Local MiniLM embeddings + SQLite vector cache
│   │   ├── matching.js        # Scoring, skill detection, calibration
│   │   ├── recommend.js       # Rank all open jobs for a resume
│   │   ├── resume.js          # PDF validation + text extraction
│   │   └── application.js     # Serializers + match persistence
│   ├── utils/                 # responses, validators, rate limiting
│   └── test/smoke.mjs         # 84-check API test
├── frontend/
│   ├── *.html                 # Landing, signup, login, careers, apply, profile, recruiter pages
│   ├── css/custom.css         # Theme tokens incl. dark mode
│   └── js/                    # Pages, layout, UI, charts, command palette
├── .nvmrc                     # Node 24 for hosted builds
├── render.yaml                # Render Blueprint (one-click deploy)
├── instance/                  # SQLite database (runtime, gitignored)
└── uploads/                   # Resume PDFs (runtime, gitignored)
```

## Deploy to GitHub + Railway/Render

GitHub Pages **cannot** run this app — it needs Node.js, SQLite, and file
uploads. Use GitHub for the repository and a Node host (the live demo uses
Railway) for the server.

### Current live deployment (Railway)

- Project/service: `hiresense-ai`
- Public URL: <https://hiresense-ai-production-56b9.up.railway.app>
- Redeploy after changes: `railway up --ci --service hiresense-ai` (run `railway login` first)
- Environment variables: `SECRET_KEY`, `SESSION_COOKIE_SECURE=1`, `TRUST_PROXY=1`,
  `ENABLE_REGISTRATION=1`, `DATABASE_PATH=/data/hiresense.db`,
  `UPLOAD_FOLDER=/data/uploads`
- A Railway volume is mounted at `/data`, so recruiter accounts, applicant accounts,
  applications, and resume uploads survive redeploys. The first boot creates the
  database and seeds the 100 demo jobs.

### 1. Push to GitHub

Create an empty repository named `hiresense-ai` under your account
(`niteshyadav2007`), then from this folder:

```bash
git init
git add .
git commit -m "HireSense AI: Node.js app with local AI job matching"
git branch -M main
git remote add origin https://github.com/niteshyadav2007/hiresense-ai.git
git push -u origin main
```

With GitHub CLI:

```bash
gh auth login          # sign in as niteshyadav2007
gh repo create niteshyadav2007/hiresense-ai --public --source=. --push
```

### 2. Deploy on Render

**Blueprint (recommended):**

1. Sign in to [Render](https://render.com) with GitHub.
2. **New + → Blueprint**, connect the `hiresense-ai` repo.
3. Render reads `render.yaml`, creates the free web service, and deploys.
4. Open the `https://hiresense-ai-xxxx.onrender.com` URL.

**Manual web service:**

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Environment: `SECRET_KEY` (generate), `SESSION_COOKIE_SECURE=1`,
  `TRUST_PROXY=1`

### Free-plan storage note

Render's free plan has an **ephemeral filesystem**. The SQLite database and
uploaded resumes reset on restart/redeploy, so the app re-seeds the 100 jobs and
demo data each time. For persistence, attach a paid Render disk and set:

```
DATABASE_PATH=/var/data/hiresense.db
UPLOAD_FOLDER=/var/data/uploads
```

The `render.yaml` file includes the commented disk configuration. The local AI
model is downloaded again after a cold restart (about 25 MB), then cached for
the life of the instance.

### After deploy

- Visit `/health` — it should return `status: "ok"` and the AI model state.
- Open `/careers`, upload a resume, and confirm semantic matches appear.
- Log in with the demo recruiter to see the dashboard and applications.

## Notes and limitations

- Match scores are decision support, not a probability of hiring success.
  They must never replace human review and never auto-reject a candidate.
- Candidate profiles use passwordless demo identity; do not use this auth model
  for a production hiring system without verified accounts.
- Resume files are stored outside the web root and are downloadable only by the
  authenticated recruiter who owns the job.
- The embeddings model runs locally and is downloaded once from Hugging Face.
  Set `EMBEDDINGS=off` to opt out entirely; TF-IDF matching still works.
- Public endpoints are rate-limited per IP (apply: 10/hour, AI analysis and
  profile updates: 20/hour).
