-- HireSense AI database schema for SQLite.
-- Applied automatically on application startup.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recruiters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Candidate profiles are passwordless: a signed session cookie identifies the
-- profile. This is demo-grade identity, suitable for a public job board.
CREATE TABLE IF NOT EXISTS candidates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  resume_original_filename TEXT,
  resume_storage_path TEXT,
  resume_text   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id     INTEGER NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  department       TEXT NOT NULL,
  location         TEXT NOT NULL,
  employment_type  TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  description      TEXT NOT NULL,
  required_skills_json TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed', 'archived')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  public_reference TEXT NOT NULL UNIQUE,
  job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id  INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
  candidate_name TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  portfolio_url TEXT,
  resume_original_filename TEXT NOT NULL,
  resume_storage_path TEXT NOT NULL,
  resume_text   TEXT NOT NULL DEFAULT '',
  match_score   REAL,
  status        TEXT NOT NULL DEFAULT 'Applied'
                CHECK (status IN ('Applied', 'Under Review', 'Shortlisted',
                                  'Interview', 'Hired', 'Rejected')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL,
  matched_skills_json TEXT NOT NULL DEFAULT '[]',
  skills_not_detected_json TEXT NOT NULL DEFAULT '[]',
  explanation   TEXT NOT NULL DEFAULT '',
  engine        TEXT NOT NULL DEFAULT 'tfidf',
  created_at    TEXT NOT NULL
);

-- Cache of job embeddings so each job is embedded once (until it is edited).
CREATE TABLE IF NOT EXISTS job_embeddings (
  job_id        INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  engine        TEXT NOT NULL,
  job_updated_at TEXT NOT NULL,
  vector_json   TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  recruiter_id  INTEGER NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  note          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  old_status    TEXT,
  new_status    TEXT NOT NULL,
  changed_by_recruiter_id INTEGER REFERENCES recruiters(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recruiter_settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id  INTEGER NOT NULL UNIQUE REFERENCES recruiters(id) ON DELETE CASCADE,
  page_size     INTEGER NOT NULL DEFAULT 10,
  default_sort  TEXT NOT NULL DEFAULT 'newest',
  updated_at    TEXT NOT NULL
);

-- Indexes for frequently searched / filtered columns.
CREATE INDEX IF NOT EXISTS idx_jobs_recruiter      ON jobs(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_department     ON jobs(department);
CREATE INDEX IF NOT EXISTS idx_jobs_location       ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_created        ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_apps_job            ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_status         ON applications(status);
CREATE INDEX IF NOT EXISTS idx_apps_created        ON applications(created_at);
CREATE INDEX IF NOT EXISTS idx_apps_reference      ON applications(public_reference);
CREATE INDEX IF NOT EXISTS idx_match_app           ON match_results(application_id);
CREATE INDEX IF NOT EXISTS idx_notes_app           ON application_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_history_app         ON application_status_history(application_id);
