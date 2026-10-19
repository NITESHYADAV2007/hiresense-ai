// AI-assisted resume/job matching — direct port of the former Python service.
//
// Approach (documented and deliberately simple):
//   1. Normalise the job description and the extracted resume text.
//   2. Vectorise both documents with TF-IDF (English stop words).
//   3. Compute cosine similarity and normalise it to a 0-100 display score.
//   4. Compare the job's required skills against the resume text using
//      case-insensitive matching plus a small documented synonym map.
//
// The score is decision support only. It is NOT a probability of hiring success
// and must never be used to automatically reject candidates.
import { normalizeWhitespace } from "../utils/helpers.js";
import { snippetAround } from "./resume.js";
import {
  EMBEDDING_MODEL,
  cosineSimilarity,
  embedText,
  jobTextFor,
  jobVectors,
} from "./embeddings.js";

// Documented synonym map: a resume mentioning a synonym counts as detecting the
// required skill. Keys and values are lower-case.
export const SKILL_SYNONYMS = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  react: ["reactjs", "react.js"],
  vue: ["vuejs", "vue.js"],
  angular: ["angularjs"],
  node: ["nodejs", "node.js"],
  nodejs: ["node.js", "node"],
  python: ["python3"],
  postgres: ["postgresql"],
  postgresql: ["postgres"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "continuous integration", "continuous delivery", "continuous deployment"],
  "machine learning": ["ml"],
  "natural language processing": ["nlp"],
  "amazon web services": ["aws"],
  aws: ["amazon web services"],
  "google cloud": ["gcp", "google cloud platform"],
  gcp: ["google cloud", "google cloud platform"],
  mongo: ["mongodb"],
  mongodb: ["mongo"],
  rest: ["restful", "rest api", "rest apis"],
  graphql: ["graph ql"],
  html: ["html5"],
  css: ["css3"],
  tailwind: ["tailwind css", "tailwindcss"],
  nextjs: ["next.js", "next js"],
  express: ["expressjs", "express.js"],
  docker: ["containers", "containerization"],
  sql: ["mysql", "sqlite", "mariadb", "sql server"],
  figma: ["figma"],
  "product management": ["product manager", "product owner"],
  "project management": ["project manager"],
  "communication skills": ["communication", "written communication", "verbal communication"],
  leadership: ["led", "leading", "team lead"],
  "problem solving": ["problem-solving", "troubleshooting"],
  adaptability: ["adaptive", "flexible"],
};

// English stop words (scikit-learn's "english" list).
const STOP_WORDS = new Set([
  "a", "about", "above", "across", "after", "afterwards", "again", "against", "all", "almost",
  "alone", "along", "already", "also", "although", "always", "am", "among", "amongst", "amoungst",
  "amount", "an", "and", "another", "any", "anyhow", "anyone", "anything", "anyway", "anywhere",
  "are", "around", "as", "at", "back", "be", "became", "because", "become", "becomes", "becoming",
  "been", "before", "beforehand", "behind", "being", "below", "beside", "besides", "between",
  "beyond", "bill", "both", "bottom", "but", "by", "call", "can", "cannot", "cant", "co", "computer",
  "con", "could", "couldnt", "cry", "de", "describe", "detail", "did", "didnt", "do", "does",
  "doesnt", "doing", "don", "done", "down", "due", "during", "each", "eg", "eight", "either",
  "eleven", "else", "elsewhere", "empty", "enough", "etc", "even", "ever", "every", "everyone",
  "everything", "everywhere", "except", "few", "fifteen", "fifty", "fill", "find", "fire", "first",
  "five", "for", "former", "formerly", "forty", "found", "four", "from", "front", "full", "further",
  "get", "give", "go", "had", "has", "hasnt", "have", "he", "hence", "her", "here", "hereafter",
  "hereby", "herein", "hereupon", "hers", "herself", "him", "himself", "his", "how", "however",
  "hundred", "i", "ie", "if", "in", "inc", "indeed", "interest", "into", "is", "it", "its",
  "itself", "keep", "last", "latter", "latterly", "least", "less", "ltd", "made", "many", "may",
  "me", "meanwhile", "might", "mill", "mine", "more", "moreover", "most", "mostly", "move", "much",
  "must", "my", "myself", "name", "namely", "neither", "never", "nevertheless", "next", "nine",
  "no", "nobody", "none", "noone", "nor", "not", "nothing", "now", "nowhere", "of", "off", "often",
  "on", "once", "one", "only", "onto", "or", "other", "others", "otherwise", "our", "ours",
  "ourselves", "out", "over", "own", "part", "per", "perhaps", "please", "put", "rather", "re",
  "same", "see", "seem", "seemed", "seeming", "seems", "serious", "several", "she", "should",
  "show", "side", "since", "sincere", "six", "sixty", "so", "some", "somehow", "someone",
  "something", "sometime", "sometimes", "somewhere", "still", "such", "system", "take", "ten",
  "than", "that", "the", "their", "them", "themselves", "then", "thence", "there", "thereafter",
  "thereby", "therefore", "therein", "thereupon", "these", "they", "thick", "thin", "third",
  "this", "those", "though", "three", "through", "throughout", "thru", "thus", "to", "together",
  "too", "top", "toward", "towards", "twelve", "twenty", "two", "un", "under", "until", "up",
  "upon", "us", "very", "via", "was", "we", "well", "were", "what", "whatever", "when", "whence",
  "whenever", "where", "whereafter", "whereas", "whereby", "wherein", "whereupon", "wherever",
  "whether", "which", "while", "whither", "who", "whoever", "whole", "whom", "whose", "why",
  "will", "with", "within", "without", "would", "yet", "you", "your", "yours", "yourself",
  "yourselves",
]);

function synonymsFor(skill) {
  const key = String(skill).trim().toLowerCase();
  return [key, ...(SKILL_SYNONYMS[key] || [])];
}

/** Word-boundary aware, case-insensitive containment check. */
export function containsTerm(textLower, term) {
  if (!term) return false;
  const escaped = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
  return pattern.test(textLower);
}

export { synonymsFor };

/** Tokenizer equivalent to scikit-learn's default token_pattern (?u)\b\w\w+\b. */
function tokenize(text) {
  const tokens = [];
  for (const word of String(text).toLowerCase().match(/[0-9a-z_]{2,}/g) || []) {
    if (!STOP_WORDS.has(word)) tokens.push(word);
  }
  return tokens;
}

/**
 * Cosine similarity between the job description and resume text (0-100),
 * using TF-IDF with smoothed IDF and L2 normalisation (sklearn defaults).
 */
export function computeSimilarity(jobText, resumeText) {
  const job = normalizeWhitespace(jobText);
  const resume = normalizeWhitespace(resumeText);
  if (!job || !resume) return 0.0;

  const docs = [tokenize(job), tokenize(resume)];
  if (docs[0].length === 0 || docs[1].length === 0) return 0.0;

  // Document frequencies within the 2-document corpus.
  const df = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const n = 2; // corpus size
  const idf = (term) => Math.log((1 + n) / (1 + (df.get(term) || 0))) + 1;

  const vectors = docs.map((tokens) => {
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      const weight = count * idf(term);
      vec.set(term, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (const [term, weight] of vec) vec.set(term, weight / norm);
    }
    return vec;
  });

  let dot = 0;
  for (const [term, weight] of vectors[0]) {
    const other = vectors[1].get(term);
    if (other !== undefined) dot += weight * other;
  }
  const score = Math.max(0, Math.min(dot, 1));
  return Math.round(score * 1000) / 10; // one decimal, like the old service
}

/** Split required skills into [matched, missing]. Matched entries: {skill, evidence}. */
export function compareSkills(requiredSkills, resumeText) {
  const textLower = String(resumeText || "").toLowerCase();
  const matched = [];
  const missing = [];

  for (const skill of requiredSkills) {
    let found = false;
    let evidence = null;
    for (const term of synonymsFor(skill)) {
      if (containsTerm(textLower, term)) {
        found = true;
        evidence = snippetAround(resumeText, term) || snippetAround(resumeText, skill);
        break;
      }
    }
    if (found) matched.push({ skill, evidence });
    else missing.push(skill);
  }
  return [matched, missing];
}

/** Cosine-to-score calibration for MiniLM embeddings on resume/job-length text.
 *  Raw cosine for a strong match typically lands around 0.55-0.65, not 1.0,
 *  so a linear raw percentage would make every match look weak. */
export const SEMANTIC_FLOOR = 0.1;
export const SEMANTIC_CEILING = 0.68;

export function calibratedSemanticScore(rawCosine) {
  const value = Math.max(0, Math.min(1, Number(rawCosine) || 0));
  const scaled = (value - SEMANTIC_FLOOR) / (SEMANTIC_CEILING - SEMANTIC_FLOOR);
  return Math.round(Math.max(0, Math.min(1, scaled)) * 1000) / 10;
}

/** Blend semantic similarity with required-skill coverage (80/20). */
export function semanticMatchScore(rawCosine, matchedCount, requiredCount) {
  const semantic = calibratedSemanticScore(rawCosine);
  if (!requiredCount) return semantic;
  const coverage = (matchedCount / requiredCount) * 100;
  return Math.round((semantic * 0.8 + coverage * 0.2) * 10) / 10;
}

const GENERIC_TITLE_WORDS = new Set([
  "senior", "junior", "lead", "staff", "principal", "entry", "intern",
  "engineer", "developer", "manager", "analyst", "designer", "scientist",
  "specialist", "associate", "director", "head", "technical", "software",
  "growth", "platform", "payments", "search", "identity", "core",
  "infrastructure", "experience", "trust", "safety",
]);

/** Pull the largest "N years" claim out of the resume (0 when unknown). */
export function resumeYears(text) {
  const matches = [...String(text || "").matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi)].map(
    (m) => Number(m[1])
  );
  return matches.length ? Math.max(...matches) : 0;
}

/**
 * Small, transparent reranking signal on top of semantic similarity:
 * +5 per distinctive job-title word found in the resume, an exact title
 * phrase match worth +14, and a seniority alignment adjustment. This stops
 * "Junior Backend Engineer" from outranking "Senior Frontend Engineer" for a
 * senior frontend resume while keeping the embedding score as the base.
 */
export function titleBoost(jobTitle, resumeText, years) {
  const title = String(jobTitle || "").toLowerCase();
  const resume = String(resumeText || "").toLowerCase();
  const words = title
    .split(/[^a-z0-9+#]+/)
    .filter((word) => word.length >= 3 && !GENERIC_TITLE_WORDS.has(word));
  const hits = words.filter((word) => resume.includes(word));
  let boost = Math.min(10, hits.length * 5);

  const phrase = title.replace(/\s+[—–-].*$/, "").trim();
  if (phrase.length >= 6 && resume.includes(phrase)) boost = Math.max(boost, 14);

  if (years >= 5) {
    if (/\b(junior|entry|intern)\b/.test(title)) boost -= 8;
    else if (/\b(senior|lead|staff|principal)\b/.test(title)) boost += 3;
  } else if (years > 0 && years < 2) {
    if (/\b(senior|lead|staff|principal)\b/.test(title)) boost -= 8;
    else if (/\b(junior|entry|intern)\b/.test(title)) boost += 3;
  }
  return boost;
}

function buildAnalysis(job, resumeText, score, engine) {
  const requiredSkills = (job && job.required_skills) || [];
  const [matched, missing] = compareSkills(requiredSkills, resumeText);
  const total = requiredSkills.length;
  const foundCount = matched.length;
  const method =
    engine === "embeddings"
      ? `semantic match score of ${score}/100 (${EMBEDDING_MODEL} embeddings, skill overlap, and title alignment)`
      : `text similarity of ${score}/100 (TF-IDF cosine similarity)`;
  let explanation =
    total > 0
      ? `The resume and job description have a ${method}. ` +
        `${foundCount} of ${total} required skills were detected in the resume text.`
      : `The resume and job description have a ${method}. This job lists no required skills.`;
  explanation +=
    " This score is decision-support only; it is not a prediction of job " +
    "performance and does not account for context, seniority, or synonyms.";

  return {
    similarity_score: score,
    matched_skills: matched,
    skills_not_detected: missing,
    explanation,
    engine,
  };
}

/** Synchronous TF-IDF analysis (also the fallback when embeddings are off). */
export function analyze(job, resumeText) {
  const score = computeSimilarity(jobTextFor(job), resumeText);
  return buildAnalysis(job, resumeText, score, "tfidf");
}

/**
 * Preferred analysis path: semantic embeddings when the local model is
 * available, otherwise the TF-IDF scorer. Skills are always rule-based.
 */
export async function analyzeAsync(job, resumeText) {
  try {
    const vectors = await jobVectors([job]);
    if (vectors && job && job.id !== undefined) {
      const jobVector = vectors.get(job.id);
      const resumeVector = jobVector ? await embedText(resumeText) : null;
      if (jobVector && resumeVector) {
        const raw = cosineSimilarity(jobVector, resumeVector);
        const required = (job && job.required_skills) || [];
        const [matched] = compareSkills(required, resumeText);
        const base = semanticMatchScore(raw, matched.length, required.length);
        const score = Math.max(
          0,
          Math.min(100, Math.round((base + titleBoost(job.title, resumeText, resumeYears(resumeText))) * 10) / 10)
        );
        return buildAnalysis(job, resumeText, score, "embeddings");
      }
    }
  } catch (err) {
    console.error(`[matching] semantic analysis failed, using TF-IDF: ${err.message}`);
  }
  return analyze(job, resumeText);
}
