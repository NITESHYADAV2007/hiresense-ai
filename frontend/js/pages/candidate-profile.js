/* Candidate profile: create/update a profile, view AI job matches and applications. */

import { api } from "/js/api.js";
import { mountPublicNav, mountPublicFooter } from "/js/layout.js";
import {
  escapeHtml,
  formatDate,
  qs,
  statusBadge,
  toast,
  confirmDialog,
} from "/js/ui.js";

mountPublicNav({ active: "profile" });
mountPublicFooter();

const MATCH_PREVIEW = 8;

const state = {
  candidate: null,
  applications: [],
  matches: [],
  engine: null,
  openJobs: 0,
  editing: false,
  expanded: false,
};

function initials(name) {
  return (
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

function matchTone(score) {
  if (score >= 60) return { label: "Strong match", cls: "bg-success-soft text-success" };
  if (score >= 40) return { label: "Good match", cls: "bg-warning-soft text-warning" };
  return { label: "Fair match", cls: "bg-surface-container-high text-on-surface-variant" };
}

function formError(message) {
  const el = qs("#profile-form-error");
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}

function matchSkeletons(count = 4) {
  return Array.from({ length: count })
    .map(
      () => `<div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div class="hs h-4 w-2/3"></div><div class="hs mt-2 h-3 w-1/2"></div>
        <div class="hs mt-3 h-3 w-full"></div><div class="hs mt-4 h-8 w-1/2"></div>
      </div>`
    )
    .join("");
}

function matchCard(job) {
  const tone = matchTone(Number(job.match_score) || 0);
  const skills = (job.matched_skills || []).slice(0, 3);
  return `
    <article class="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="truncate font-semibold text-on-surface">${escapeHtml(job.title)}</h3>
          <p class="mt-0.5 text-body-sm text-on-surface-variant">${escapeHtml(job.department)} · ${escapeHtml(job.location)}</p>
        </div>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-label-sm font-bold ${tone.cls}" title="${tone.label}">${Number(job.match_score).toFixed(1)}%</span>
      </div>
      ${skills.length
        ? `<div class="mt-2 flex flex-wrap gap-1">${skills
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

function renderProfile(candidate) {
  qs("#profile-avatar").textContent = initials(candidate.name);
  qs("#profile-name").textContent = candidate.name;
  qs("#profile-email").textContent = candidate.email;
  qs("#profile-phone").textContent = candidate.phone || "Phone not provided";

  const resumeHost = qs("#profile-resume");
  const resumeText = resumeHost.querySelector("span:last-child");
  if (resumeText) resumeText.textContent = candidate.resume_original_filename || "No resume uploaded";
  qs("#profile-updated").textContent = `Updated ${formatDate(candidate.updated_at)}`;
  qs("#stat-applications").textContent = String(state.applications.length);
}

function renderApplications() {
  const host = qs("#profile-applications");
  qs("#applications-count").textContent = state.applications.length
    ? `${state.applications.length} submitted`
    : "";
  qs("#stat-applications").textContent = String(state.applications.length);

  if (!state.applications.length) {
    host.innerHTML = `<p class="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-6 text-center text-body-md text-on-surface-variant">
      No applications yet. Apply to one of your matches and it will appear here.
    </p>`;
    return;
  }

  host.innerHTML = state.applications
    .map(
      (app) => `<a href="/careers/${app.job_id}"
        class="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 transition hover:border-primary/40 hover:bg-surface-container-low sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="font-semibold text-on-surface">${escapeHtml(app.job_title)}</p>
          <p class="mt-0.5 text-body-sm text-on-surface-variant">${escapeHtml(app.department)} · ${escapeHtml(app.location)} · ${escapeHtml(app.employment_type)}</p>
          <p class="mt-1 text-label-sm text-on-surface-variant">Applied ${formatDate(app.created_at)} · ${escapeHtml(app.public_reference)}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          ${statusBadge(app.status)}
          <span class="rounded-full bg-surface-container-low px-2.5 py-1 text-label-sm font-semibold text-on-surface-variant">${Number(app.match_score || 0).toFixed(1)}%</span>
        </div>
      </a>`
    )
    .join("");
}

function renderMatches() {
  const host = qs("#profile-matches");
  if (!host) return;

  if (state.loadingMatches) {
    host.innerHTML = matchSkeletons();
    return;
  }

  const list = state.expanded ? state.matches : state.matches.slice(0, MATCH_PREVIEW);
  host.innerHTML = list.length
    ? list.map(matchCard).join("")
    : `<p class="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-6 text-center text-body-md text-on-surface-variant sm:col-span-2">
        No open roles matched your resume yet.
      </p>`;

  const toggle = qs("#profile-show-all");
  if (state.matches.length > MATCH_PREVIEW) {
    toggle.classList.remove("hidden");
    toggle.textContent = state.expanded ? "Show fewer" : `Show all ${state.matches.length} matches`;
  } else {
    toggle.classList.add("hidden");
  }
}

function render() {
  const candidate = state.candidate;

  if (state.editing && candidate) {
    qs("#profile-view").classList.add("hidden");
    qs("#profile-form-card").classList.remove("hidden");
    qs("#profile-form-title").textContent = "Update your profile";
    qs("#profile-form-sub").textContent =
      "Change your details or upload a new resume (leave the file empty to keep the current one).";
    qs("#profile-cancel").classList.remove("hidden");
    qs("#profile-form-name").value = candidate.name || "";
    qs("#profile-form-email").value = candidate.email || "";
    qs("#profile-form-phone").value = candidate.phone || "";
    qs("#profile-form-resume").value = "";
    qs("#profile-form-resume-label").textContent =
      candidate.resume_original_filename || "Choose PDF · max 5 MB";
    formError("");
    return;
  }

  if (!candidate) {
    qs("#profile-view").classList.add("hidden");
    qs("#profile-form-card").classList.remove("hidden");
    qs("#profile-form-title").textContent = "Create your candidate profile";
    qs("#profile-form-sub").textContent =
      "Upload a PDF resume and we'll rank every open job for you.";
    qs("#profile-cancel").classList.add("hidden");
    qs("#profile-form").reset();
    qs("#profile-form-resume-label").textContent = "Choose PDF · max 5 MB";
    formError("");
    return;
  }

  qs("#profile-form-card").classList.add("hidden");
  qs("#profile-view").classList.remove("hidden");
  renderProfile(candidate);
  renderApplications();
  renderMatches();
}

async function loadMatches() {
  if (!state.candidate) return;
  state.loadingMatches = true;
  renderMatches();
  try {
    const body = await api.get("/public/candidate/matches?limit=100");
    state.matches = (body.data && body.data.results) || [];
    state.engine = body.data && body.data.engine;
    state.openJobs = (body.meta && body.meta.open_jobs) || state.matches.length;
    qs("#stat-matches").textContent = String(state.matches.length);
    qs("#match-engine").textContent =
      `${state.matches.length} matches from ${state.openJobs} open roles · ` +
      (state.engine === "embeddings" ? "semantic AI" : "keyword AI");
  } catch (err) {
    state.matches = [];
    qs("#match-engine").textContent = "";
    qs("#profile-matches").innerHTML = `<p class="text-body-md text-danger">${escapeHtml(
      err.message || "Could not load job matches."
    )}</p>`;
    return;
  } finally {
    state.loadingMatches = false;
  }
  renderMatches();
}

async function loadProfile() {
  try {
    const body = await api.get("/public/candidate/me");
    if (body && body.data) {
      state.candidate = body.data.candidate;
      state.applications = body.data.applications || [];
      state.editing = false;
      render();
      loadMatches();
    } else {
      state.candidate = null;
      state.applications = [];
      state.matches = [];
      render();
    }
  } catch (err) {
    toast(err.message || "Could not load your profile.", "error");
    state.candidate = null;
    render();
  } finally {
    qs("#profile-loading").classList.add("hidden");
  }
}

qs("#profile-form-resume").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  qs("#profile-form-resume-label").textContent = file ? file.name : "Choose PDF · max 5 MB";
});

qs("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = qs("#profile-submit");
  const file = qs("#profile-form-resume").files && qs("#profile-form-resume").files[0];

  formError("");
  if (!state.candidate && !file) {
    formError("Choose a PDF resume first.");
    return;
  }
  if (file && !file.name.toLowerCase().endsWith(".pdf")) {
    formError("Only PDF resumes are supported.");
    return;
  }

  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span> Saving…`;

  try {
    const body = await api.postForm("/public/candidate/profile", new FormData(form));
    state.candidate = body.data.candidate;
    state.editing = false;
    state.expanded = false;
    qs("#profile-loading").classList.add("hidden");
    render();
    toast("Profile saved — your matches are ready.", "success");
    qs("#profile-view").scrollIntoView({ behavior: "smooth", block: "start" });
    loadMatches();
  } catch (err) {
    formError(err.message || "Could not save your profile.");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});

qs("#edit-profile").addEventListener("click", () => {
  state.editing = true;
  render();
  qs("#profile-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

qs("#profile-cancel").addEventListener("click", () => {
  state.editing = false;
  render();
});

qs("#profile-show-all").addEventListener("click", () => {
  state.expanded = !state.expanded;
  renderMatches();
});

qs("#forget-profile").addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Forget this profile?",
    message:
      "This removes the profile from this browser. Applications you already submitted stay with the recruiter.",
    confirmLabel: "Forget profile",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.post("/public/candidate/logout", {});
  } catch {
    /* the local view is cleared either way */
  }
  state.candidate = null;
  state.applications = [];
  state.matches = [];
  state.expanded = false;
  toast("Profile forgotten on this device.", "success");
  render();
});

loadProfile();
