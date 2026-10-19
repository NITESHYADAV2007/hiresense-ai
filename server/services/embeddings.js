// Semantic embeddings via Transformers.js (Xenova/all-MiniLM-L6-v2).
//
// Runs fully locally: no API key, no per-request cost, and no network calls
// after the first model download (cached in .cache/transformers).
// Set EMBEDDINGS=off to disable and fall back to the TF-IDF scorer.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { utcnowIso } from "../utils/helpers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CACHE_DIR = path.join(ROOT, ".cache", "transformers");

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
const MODE = String(process.env.EMBEDDINGS || "local").trim().toLowerCase();
export const EMBEDDINGS_ENABLED = !["off", "0", "false", "disabled"].includes(MODE);

const ENGINE = `embeddings:${EMBEDDING_MODEL}`;

let extractor = null;
let loadPromise = null;
let loadError = null;

async function getExtractor() {
  if (!EMBEDDINGS_ENABLED) return null;
  if (extractor) return extractor;
  if (loadError) return null;
  if (!loadPromise) {
    loadPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = CACHE_DIR;
      env.allowRemoteModels = true;
      const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
      extractor = pipe;
      return pipe;
    })().catch((err) => {
      loadError = err;
      console.error(`[embeddings] unavailable — falling back to TF-IDF: ${err.message}`);
      return null;
    });
  }
  return loadPromise;
}

/** Machine-readable status (used by /health and the UI). */
export function embeddingStatus() {
  return {
    enabled: EMBEDDINGS_ENABLED,
    ready: Boolean(extractor),
    loading: Boolean(loadPromise) && !extractor && !loadError,
    model: EMBEDDINGS_ENABLED ? EMBEDDING_MODEL : null,
    error: loadError ? loadError.message : null,
  };
}

/** Start loading the model in the background so the first request is fast. */
export function warmup() {
  if (!EMBEDDINGS_ENABLED) {
    console.log("[embeddings] disabled (EMBEDDINGS=off) — using TF-IDF matching.");
    return;
  }
  getExtractor().then((pipe) => {
    if (pipe) console.log(`[embeddings] ready (${EMBEDDING_MODEL}).`);
  });
}

/** Embed a batch of texts. Returns an array of vectors, or null when unavailable. */
export async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const pipe = await getExtractor();
  if (!pipe) return null;
  try {
    const output = await pipe(texts, { pooling: "mean", normalize: true });
    const [count, dim] = output.dims;
    const data = output.data;
    const vectors = [];
    for (let i = 0; i < count; i++) {
      vectors.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
    }
    return vectors;
  } catch (err) {
    console.error(`[embeddings] inference failed: ${err.message}`);
    return null;
  }
}

/** Embed a single text, or null when embeddings are unavailable. */
export async function embedText(text) {
  const vectors = await embedBatch([text]);
  return vectors ? vectors[0] : null;
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Canonical text used to represent a job in the embedding space. */
export function jobTextFor(job) {
  const skills = Array.isArray(job && job.required_skills) ? job.required_skills : [];
  return [
    job && job.title,
    job && job.department,
    job && job.experience_level,
    job && job.description,
    skills.join(", "),
  ]
    .filter(Boolean)
    .join(". ");
}

/**
 * Return a Map<jobId, vector> for the given jobs, reusing the SQLite cache.
 * Only jobs whose `updated_at` matches the cached row are reused; new or
 * edited jobs are embedded in one batch and persisted.
 */
export async function jobVectors(jobs) {
  if (!EMBEDDINGS_ENABLED) return null;
  const list = (jobs || []).filter((job) => job && job.id !== undefined && job.id !== null);
  if (list.length === 0) return new Map();

  const pipe = await getExtractor();
  if (!pipe) return null;

  const db = getDb();
  const vectors = new Map();
  const missing = [];

  const select = db.prepare(
    "SELECT engine, job_updated_at, vector_json FROM job_embeddings WHERE job_id = ?"
  );

  for (const job of list) {
    const row = select.get(job.id);
    if (row && row.engine === ENGINE && row.job_updated_at === (job.updated_at || "")) {
      try {
        vectors.set(job.id, JSON.parse(row.vector_json));
        continue;
      } catch {
        /* corrupted cache row — recompute below */
      }
    }
    missing.push(job);
  }

  if (missing.length > 0) {
    const embedded = await embedBatch(missing.map(jobTextFor));
    if (!embedded) return vectors.size > 0 ? vectors : null;

    const now = utcnowIso();
    const upsert = db.prepare(
      `INSERT INTO job_embeddings (job_id, engine, job_updated_at, vector_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET
         engine = excluded.engine,
         job_updated_at = excluded.job_updated_at,
         vector_json = excluded.vector_json,
         updated_at = excluded.updated_at`
    );

    for (let i = 0; i < missing.length; i++) {
      const job = missing[i];
      const vector = embedded[i].map((v) => Math.round(v * 1e6) / 1e6);
      vectors.set(job.id, vector);
      upsert.run(job.id, ENGINE, job.updated_at || "", JSON.stringify(vector), now);
    }
  }

  return vectors;
}
