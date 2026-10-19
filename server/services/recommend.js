// Rank open jobs for a resume. Uses semantic embeddings when available and
// falls back to the TF-IDF scorer; skill overlap is always rule-based.
import {
  EMBEDDING_MODEL,
  cosineSimilarity,
  embedText,
  jobTextFor,
  jobVectors,
} from "./embeddings.js";
import {
  compareSkills,
  computeSimilarity,
  resumeYears,
  semanticMatchScore,
  titleBoost,
} from "./matching.js";

function preview(text, max = 220) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) + "..." : value;
}

/**
 * @param {Array<object>} jobs   serialized jobs (id + required_skills + updated_at)
 * @param {string} resumeText    extracted resume text
 * @param {number} limit         max results (1-100)
 */
export async function rankJobs(jobs, resumeText, limit = 10) {
  const list = Array.isArray(jobs) ? jobs : [];
  let engine = "tfidf";
  const semantic = new Map();

  if (list.length > 0) {
    try {
      const vectors = await jobVectors(list);
      if (vectors) {
        const resumeVector = await embedText(resumeText);
        if (resumeVector) {
          for (const job of list) {
            const vector = vectors.get(job.id);
            if (vector) semantic.set(job.id, cosineSimilarity(vector, resumeVector));
          }
        }
      }
    } catch (err) {
      console.error(`[recommend] embeddings failed, using TF-IDF: ${err.message}`);
    }
  }

  // Only use semantic scores when every job has one, so scores are comparable.
  const useSemantic = list.length > 0 && semantic.size === list.length;
  const years = resumeYears(resumeText);

  const scored = list.map((job) => {
    const [matched] = compareSkills(job.required_skills || [], resumeText);
    const required = job.required_skills || [];
    let score;
    if (useSemantic) {
      const base = semanticMatchScore(semantic.get(job.id), matched.length, required.length);
      score = Math.max(0, Math.min(100, Math.round((base + titleBoost(job.title, resumeText, years)) * 10) / 10));
    } else {
      score = computeSimilarity(jobTextFor(job), resumeText);
    }
    return {
      job,
      score,
      matched: matched.map((m) => m.skill),
    };
  });

  if (useSemantic) engine = "embeddings";

  scored.sort(
    (a, b) => b.score - a.score || String(a.job.title).localeCompare(String(b.job.title))
  );

  return {
    engine,
    model: engine === "embeddings" ? EMBEDDING_MODEL : null,
    items: scored.slice(0, Math.max(1, Math.min(limit, 100))).map(({ job, score, matched }) => ({
      id: job.id,
      title: job.title,
      department: job.department,
      location: job.location,
      employment_type: job.employment_type,
      experience_level: job.experience_level,
      description_preview: preview(job.description),
      match_score: score,
      matched_skills: matched.slice(0, 8),
      required_skills: (job.required_skills || []).slice(0, 8),
    })),
  };
}
