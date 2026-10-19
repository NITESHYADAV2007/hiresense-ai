/* Public careers listing: search, filters, pagination. All data from the API. */

import { api } from "/js/api.js";
import { mountPublicNav, mountPublicFooter } from "/js/layout.js";
import { escapeHtml, paginationMarkup, qs, qsa, toast } from "/js/ui.js";
import { icon } from "/js/icons.js";

mountPublicNav({ active: "careers" });
mountPublicFooter();

const state = { q: "", department: "", location: "", employment_type: "", page: 1 };

const resultsEl = qs("#job-results");
const countEl = qs("#result-count");
const paginationEl = qs("#pagination");

function jobCard(job) {
  const skills = (job.required_skills || []).slice(0, 5);
  return `
    <article class="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition hover:border-primary/40 hover:shadow-pop">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-headline-sm text-headline-sm leading-snug text-on-surface">${escapeHtml(job.title)}</h3>
          <p class="mt-1 flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            ${icon("Building", { className: "text-[16px]" })} ${escapeHtml(job.department)}
          </p>
        </div>
        <span class="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-label-sm text-success">Open</span>
      </div>
      <dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-body-sm text-on-surface-variant">
        <div class="flex items-center gap-1.5">${icon("MapPin", { className: "text-[16px]" })}<span>${escapeHtml(job.location)}</span></div>
        <div class="flex items-center gap-1.5">${icon("Clock", { className: "text-[16px]" })}<span>${escapeHtml(job.employment_type)}</span></div>
        <div class="flex items-center gap-1.5">${icon("Star", { className: "text-[16px]" })}<span>${escapeHtml(job.experience_level)}</span></div>
      </dl>
      <p class="mt-3 flex-1 text-body-md leading-6 text-on-surface-variant">${escapeHtml(job.description_preview || "")}</p>
      ${skills.length
        ? `<ul class="mt-4 flex flex-wrap gap-1.5">${skills
            .map((s) => `<li class="rounded-full bg-primary-fixed px-2.5 py-1 text-label-sm text-on-primary-fixed-variant">${escapeHtml(s)}</li>`)
            .join("")}${(job.required_skills || []).length > 5
            ? `<li class="rounded-full bg-surface-container-low px-2.5 py-1 text-label-sm text-on-surface-variant">+${job.required_skills.length - 5} more</li>`
            : ""}</ul>`
        : ""}
      <a href="/careers/${job.id}"
         class="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2.5 text-body-md font-semibold text-on-surface transition hover:bg-primary hover:text-on-primary">
        View Details ${icon("ArrowRight", { className: "text-[18px]" })}
      </a>
    </article>`;
}

async function loadFilters() {
  try {
    const body = await api.get("/public/jobs/filters");
    const fill = (selectId, values) => {
      const select = qs(selectId);
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    };
    fill("#filter-department", body.data.departments || []);
    fill("#filter-location", body.data.locations || []);
    fill("#filter-type", body.data.employment_types || []);
  } catch {
    /* filter options are optional; listing still works without them */
  }
}

async function loadJobs() {
  resultsEl.innerHTML = `
    <div class="md:col-span-2 xl:col-span-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      ${Array.from({ length: 6 })
        .map(
          () => `<div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <div class="hs h-4 w-3/4"></div><div class="hs mt-3 h-3 w-1/2"></div>
            <div class="hs mt-4 h-3 w-full"></div><div class="hs mt-2 h-3 w-5/6"></div>
            <div class="hs mt-5 h-9 w-full"></div></div>`
        )
        .join("")}
    </div>`;

  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  try {
    const body = await api.get(`/public/jobs?${params.toString()}`);
    const jobs = body.data || [];
    const meta = body.meta || { total: 0, page: 1, total_pages: 1 };

    countEl.textContent = meta.total === 0 ? "No positions found" : `${meta.total} open position${meta.total === 1 ? "" : "s"}`;

    if (!jobs.length) {
      resultsEl.innerHTML = `
        <div class="md:col-span-2 xl:col-span-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-16 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">${icon("Search", { className: "text-[24px]" })}</div>
          <h3 class="mt-4 font-headline-sm text-headline-sm text-on-surface">No open roles match your search</h3>
          <p class="mt-1.5 max-w-md text-body-md text-on-surface-variant">Try different keywords or clear the filters to see everything that is open right now.</p>
          <button type="button" data-clear class="mt-5 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-lowest">Clear filters</button>
        </div>`;
      resultsEl.querySelector("[data-clear]")?.addEventListener("click", clearAll);
      paginationEl.innerHTML = "";
      return;
    }

    resultsEl.innerHTML = jobs.map(jobCard).join("");
    paginationEl.innerHTML = paginationMarkup(meta);
    qsa("#pagination [data-action='page']").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.page = Number(btn.dataset.page);
        loadJobs();
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
  } catch (err) {
    toast(err.message, "error");
    resultsEl.innerHTML = `
      <div class="md:col-span-2 xl:col-span-3 flex flex-col items-center justify-center rounded-xl border border-error/30 bg-danger-soft px-6 py-14 text-center">
        <h3 class="font-headline-sm text-headline-sm text-danger">Could not load jobs</h3>
        <p class="mt-1.5 text-body-md text-danger/80">${escapeHtml(err.message)}</p>
        <button type="button" onclick="location.reload()" class="mt-5 rounded-lg bg-error px-4 py-2 text-body-md font-semibold text-on-error">Reload page</button>
      </div>`;
  }
}

function clearAll() {
  state.q = "";
  state.department = "";
  state.location = "";
  state.employment_type = "";
  state.page = 1;
  qs("#filters").reset();
  qs("#q").value = "";
  loadJobs();
}

let debounce;
qs("#filters").addEventListener("input", (event) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const form = new FormData(qs("#filters"));
    state.q = (form.get("q") || "").toString().trim();
    state.department = (form.get("department") || "").toString();
    state.location = (form.get("location") || "").toString();
    state.employment_type = (form.get("employment_type") || "").toString();
    state.page = 1;
    qs("#q").value = state.q;
    loadJobs();
  }, 300);
});

qs("#filters").addEventListener("submit", (event) => event.preventDefault());
qs("#clear-filters").addEventListener("click", clearAll);

// Hero search filters as you type, same as the sidebar keyword box.
let heroDebounce;
qs("#q").addEventListener("input", () => {
  clearTimeout(heroDebounce);
  heroDebounce = setTimeout(() => {
    state.q = qs("#q").value.trim();
    qs("#filter-keyword").value = state.q;
    state.page = 1;
    loadJobs();
  }, 300);
});

qs("#hero-search").addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(heroDebounce);
  state.q = qs("#q").value.trim();
  qs("#filter-keyword").value = state.q;
  state.page = 1;
  loadJobs();
});

// Deep links like /careers?q=engineer pre-fill both search boxes.
const initialQ = (new URLSearchParams(window.location.search).get("q") || "").trim();
if (initialQ) {
  state.q = initialQ;
  qs("#q").value = initialQ;
  qs("#filter-keyword").value = initialQ;
}

// ---------- AI resume matcher (public, no account required) ----------
const MATCH_PREVIEW = 9;
let allMatches = [];
let matchesExpanded = false;

function matchTone(score) {
  if (score >= 60) return { label: "Strong match", cls: "bg-success-soft text-success" };
  if (score >= 40) return { label: "Good match", cls: "bg-warning-soft text-warning" };
  return { label: "Fair match", cls: "bg-surface-container-high text-on-surface-variant" };
}

function matchCard(job) {
  const tone = matchTone(Number(job.match_score) || 0);
  const skills = (job.matched_skills || []).slice(0, 4);
  const previewText = String(job.description_preview || "");
  return `
    <article class="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate font-semibold text-on-surface">${escapeHtml(job.title)}</h3>
          <p class="mt-1 text-body-sm text-on-surface-variant">${escapeHtml(job.department)} · ${escapeHtml(job.location)} · ${escapeHtml(job.employment_type)}</p>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-1 text-label-sm font-bold ${tone.cls}" title="${tone.label}">${Number(job.match_score).toFixed(1)}%</span>
      </div>
      <p class="mt-2 text-body-sm leading-5 text-on-surface-variant">${escapeHtml(previewText.slice(0, 140))}${previewText.length > 140 ? "…" : ""}</p>
      ${skills.length
        ? `<div class="mt-3 flex flex-wrap gap-1">${skills
            .map(
              (skill) =>
                `<span class="rounded-full bg-primary-fixed px-2 py-0.5 text-label-sm text-on-primary-fixed-variant">${escapeHtml(skill)}</span>`
            )
            .join("")}</div>`
        : ""}
      <div class="mt-auto flex items-center gap-2 pt-3">
        <a href="/careers/${job.id}" class="rounded-lg border border-outline-variant px-3 py-1.5 text-body-sm font-semibold text-on-surface hover:bg-surface-container-low">View</a>
        <a href="/apply/${job.id}" class="rounded-lg bg-primary-container px-3 py-1.5 text-body-sm font-semibold text-on-primary hover:bg-primary">Apply</a>
      </div>
    </article>`;
}

function matchSkeletons(count = 3) {
  return Array.from({ length: count })
    .map(
      () => `<div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div class="hs h-4 w-2/3"></div><div class="hs mt-2 h-3 w-1/2"></div>
        <div class="hs mt-3 h-3 w-full"></div><div class="hs mt-2 h-3 w-5/6"></div>
        <div class="hs mt-4 h-8 w-1/2"></div>
      </div>`
    )
    .join("");
}

function renderMatches() {
  const list = matchesExpanded ? allMatches : allMatches.slice(0, MATCH_PREVIEW);
  qs("#match-list").innerHTML = list.length
    ? list.map(matchCard).join("")
    : `<p class="text-body-md text-on-surface-variant">No open roles matched. Try a resume with more detail.</p>`;

  const toggle = qs("#match-show-all");
  if (allMatches.length > MATCH_PREVIEW) {
    toggle.classList.remove("hidden");
    toggle.textContent = matchesExpanded ? "Show fewer" : `Show all ${allMatches.length} matches`;
  } else {
    toggle.classList.add("hidden");
  }
}

qs("#match-show-all").addEventListener("click", () => {
  matchesExpanded = !matchesExpanded;
  renderMatches();
});

qs("#resume-match-file").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  qs("#resume-file-label").textContent = file ? file.name : "Choose PDF";
});

qs("#resume-match-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = qs("#resume-match-file");
  const errorEl = qs("#resume-match-error");
  const button = qs("#resume-match-btn");
  const file = input.files && input.files[0];

  errorEl.classList.add("hidden");
  if (!file) {
    errorEl.textContent = "Choose a PDF resume first.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    errorEl.textContent = "Only PDF resumes are supported.";
    errorEl.classList.remove("hidden");
    return;
  }

  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span> Analyzing…`;

  matchesExpanded = false;
  qs("#match-results").classList.remove("hidden");
  qs("#match-meta").textContent = "Comparing your resume with every open role…";
  qs("#match-list").innerHTML = matchSkeletons();
  qs("#match-show-all").classList.add("hidden");

  try {
    const form = new FormData();
    form.append("resume", file);
    form.append("limit", "100");
    const body = await api.postForm("/public/recommendations", form);
    allMatches = (body.data && body.data.results) || [];
    const engine = body.data && body.data.engine === "embeddings" ? "semantic AI" : "keyword AI";
    const total = (body.meta && body.meta.open_jobs) ?? allMatches.length;
    qs("#match-meta").textContent = `${allMatches.length} matches from ${total} open roles · ${engine}`;
    renderMatches();
    qs("#match-results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    qs("#match-results").classList.add("hidden");
    errorEl.textContent = err.message || "The resume could not be analyzed. Please try again.";
    errorEl.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});

loadFilters().then(loadJobs);
