# HireSense AI

An AI-assisted recruitment platform: recruiters post jobs and review candidates,
while candidates browse roles, upload a resume, get AI-ranked job matches, and
apply — all from one Node.js app.

Built with **Node.js + Express**, **SQLite** (`node:sqlite`), and a **vanilla
HTML/CSS/JS** frontend. No Python, no bundler, no external AI API key.

---

## Features

**Public careers site**

- 100 realistic demo jobs with search, department/location/type filters, and pagination
- Upload a PDF resume and get **up to 100 AI-ranked job matches** — no account needed
- Apply in minutes with an opaque confirmation reference
- Responsive, accessible UI with light/dark themes

**Candidate profile** (passwordless)

- Upload a resume once and create a profile
- See your AI-ranked matches and required-skill overlap
- Every application submitted with the same email is linked to your profile and
  appears under **My applications** with its live status
- Update your details or resume; "Forget on this device" clears the profile cookie

**Recruiter workspace**

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

## Scripts

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm start`         | Seed up to 100 jobs, then start the server on port 3000       |
| `npm run dev`       | Same, with auto-restart on file changes                       |
| `npm run seed`      | Create the demo account and the 3 original sample jobs        |
| `npm run seed:jobs` | Add generated jobs until the database has 100 jobs (idempotent) |
| `npm run smoke`     | 70-check end-to-end API test (run while the server is up)      |

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
| `ENABLE_REGISTRATION`   | off                     | Set to `1` to enable recruiter self-registration            |
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

## Candidate profiles

Profiles are **passwordless**: a signed, HTTP-only session cookie stores a
`candidate_id`. Creating a profile with a resume lets you return to your matches
and application history on the same browser without a password. This is
demo-grade identity suitable for a public portfolio project; for a real product
you would add verified candidate accounts and email ownership checks.

Applications are linked to a profile only when the application email matches the
profile email. Recruiters never see the profile cookie.

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
│   └── test/smoke.mjs         # 70-check API test
├── frontend/
│   ├── *.html                 # Landing, careers, apply, profile, recruiter pages
│   ├── css/custom.css         # Theme tokens incl. dark mode
│   └── js/                    # Pages, layout, UI, charts, command palette
├── render.yaml                # Render Blueprint (one-click deploy)
├── instance/                  # SQLite database (runtime, gitignored)
└── uploads/                   # Resume PDFs (runtime, gitignored)
```

## Deploy to GitHub + Render

GitHub Pages **cannot** run this app — it needs Node.js, SQLite, and file
uploads. Use GitHub for the repository and Render for the live server.

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
