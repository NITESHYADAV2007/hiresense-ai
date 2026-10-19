// SQLite database access using Node's built-in `node:sqlite` module
// (no native compilation required on Node >= 22.5).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(HERE, "schema.sql");

let db = null;

/** Open (and initialise) the shared database connection. */
export function getDb() {
  if (db) return db;
  const dbPath = currentConfig.databasePath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

let currentConfig = {};

/** Apply a new configuration (used by the server and by seed/tests). */
export function configure({ databasePath, uploadFolder }) {
  if (databasePath || uploadFolder) {
    if (db) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      db = null;
    }
  }
  if (databasePath) currentConfig.databasePath = databasePath;
  if (uploadFolder) currentConfig.uploadFolder = uploadFolder;
}

/** Apply lightweight, backward-compatible migrations to an existing database. */
function applyMigrations(conn) {
  const columns = (table) =>
    conn
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name);
  const ensureColumn = (table, column, definition) => {
    if (!columns(table).includes(column)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn("match_results", "engine", "TEXT NOT NULL DEFAULT 'tfidf'");
  ensureColumn("applications", "candidate_id", "INTEGER REFERENCES candidates(id)");
}

/** Create required folders and apply the schema (idempotent). */
export function initDb({ databasePath, uploadFolder }) {
  configure({ databasePath, uploadFolder });
  fs.mkdirSync(uploadFolder, { recursive: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  const conn = getDb();
  conn.exec(schema);
  applyMigrations(conn);
  return conn;
}

/** Convert a raw sqlite row (null-prototype object) into a plain object. */
export function rowToDict(row) {
  if (row === null || row === undefined) return null;
  return Object.assign({}, row);
}

export function closeDb() {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}
