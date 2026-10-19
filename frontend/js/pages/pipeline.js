/* Pipeline kanban: grouped applications with drag-and-drop + dropdown stage changes. */

import { api, qs as qsParams } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, scoreBadge, avatarChip, toast, toastError,
  emptyState, qs,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "pipeline", title: "Pipeline" });

const STATUSES = ["Applied", "Under Review", "Shortlisted", "Interview", "Hired", "Rejected"];

const COLUMN_TONES = {
  Applied: { bar: "bg-info", chip: "bg-info-soft text-info" },
  "Under Review": { bar: "bg-warning", chip: "bg-warning-soft text-warning" },
  Shortlisted: { bar: "bg-primary-container", chip: "bg-primary-fixed text-on-primary-fixed-variant" },
  Interview: { bar: "bg-interview", chip: "bg-interview-soft text-interview" },
  Hired: { bar: "bg-success", chip: "bg-success-soft text-success" },
  Rejected: { bar: "bg-error", chip: "bg-error-container text-on-error-container" },
};

const boardInner = qs("#board > div");
let grouped = {};
let dragId = null;

function card(app) {
  const tone = COLUMN_TONES[app.status] || COLUMN_TONES.Applied;
  return `
    <article draggable="true" data-app-id="${app.id}"
             class="drag-card cursor-grab rounded-xl border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-pop active:cursor-grabbing">
      <div class="flex items-start gap-2.5">
        ${avatarChip(app.candidate_name, { size: "h-9 w-9", text: "text-label-md" })}
        <div class="min-w-0 flex-1">
          <a href="/candidates/${app.id}" class="block truncate text-body-md font-semibold text-on-surface hover:text-primary">${escapeHtml(app.candidate_name)}</a>
          <p class="truncate text-body-sm text-on-surface-variant">${escapeHtml(app.job_title)}</p>
        </div>
        ${scoreBadge(app.match_score)}
      </div>
      <div class="mt-3 flex items-center justify-between gap-2">
        <span class="text-body-sm text-on-surface-variant">${formatDate(app.created_at)}</span>
        <select data-move="${app.id}" aria-label="Move candidate to another stage"
                class="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-body-sm text-on-surface focus:border-primary focus:outline-none">
          ${STATUSES.map((s) => `<option ${s === app.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
    </article>`;
}

function render() {
  boardInner.innerHTML = STATUSES.map((status) => {
    const apps = grouped[status] || [];
    const tone = COLUMN_TONES[status];
    return `
      <section class="flex w-72 shrink-0 flex-col rounded-xl border border-outline-variant bg-surface-container-low p-3"
               data-column="${escapeHtml(status)}" aria-label="${escapeHtml(status)} stage">
        <div class="flex items-center gap-2 px-1 pb-3">
          <span class="h-2.5 w-2.5 rounded-full ${tone.bar}" aria-hidden="true"></span>
          <h2 class="flex-1 text-body-md font-semibold text-on-surface">${escapeHtml(status)}</h2>
          <span class="rounded-full bg-surface-container-lowest px-2 py-0.5 text-label-sm text-on-surface-variant">${apps.length}</span>
        </div>
        <div data-drop-zone class="flex-1 space-y-2.5 overflow-y-auto rounded-lg p-1" style="min-height: 6rem">
          ${apps.length
            ? apps.map(card).join("")
            : `<p class="px-2 py-6 text-center text-body-sm text-on-surface-variant/70">Drop candidates here</p>`}
        </div>
      </section>`;
  }).join("");

  wireCards();
}

function wireCards() {
  // Drag events
  boardInner.querySelectorAll(".drag-card").forEach((el) => {
    el.addEventListener("dragstart", (event) => {
      dragId = el.dataset.appId;
      el.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragId);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      dragId = null;
      boardInner.querySelectorAll("[data-drop-zone]").forEach((z) => z.classList.remove("drop-target"));
    });
  });

  boardInner.querySelectorAll("[data-drop-zone]").forEach((zone) => {
    const column = zone.closest("[data-column]");
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.classList.add("drop-target");
    });
    column.addEventListener("dragleave", () => zone.classList.remove("drop-target"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("drop-target");
      const id = event.dataTransfer.getData("text/plain") || dragId;
      const next = column.dataset.column;
      if (id && next) await move(id, next);
    });
  });

  // Dropdown fallback (keyboard/touch friendly)
  boardInner.querySelectorAll("[data-move]").forEach((select) => {
    select.addEventListener("change", async () => {
      await move(select.dataset.move, select.value);
    });
  });
}

async function move(id, nextStatus) {
  const app = findApp(Number(id));
  if (!app || app.status === nextStatus) return;
  const prev = app.status;
  optimisticMove(Number(id), nextStatus);
  try {
    await api.patch(`/applications/${id}/status`, { status: nextStatus });
    toast(`${app.candidate_name} moved to “${nextStatus}”.`, "success");
  } catch (err) {
    optimisticMove(Number(id), prev);
    toastError(err);
  }
}

function findApp(id) {
  for (const status of STATUSES) {
    const found = (grouped[status] || []).find((a) => a.id === id);
    if (found) return found;
  }
  return null;
}

function optimisticMove(id, nextStatus) {
  const app = findApp(id);
  if (!app) return;
  grouped[app.status] = (grouped[app.status] || []).filter((a) => a.id !== id);
  app.status = nextStatus;
  grouped[nextStatus] = [app, ...(grouped[nextStatus] || [])];
  render();
}

async function load() {
  boardInner.innerHTML = STATUSES.map(
    (status) => `<section class="flex w-72 shrink-0 flex-col rounded-xl border border-outline-variant bg-surface-container-low p-3">
      <div class="flex items-center gap-2 px-1 pb-3">
        <span class="h-2.5 w-2.5 rounded-full bg-outline-variant" aria-hidden="true"></span>
        <h2 class="flex-1 text-body-md font-semibold text-on-surface">${status}</h2>
      </div>
      <div class="flex-1 space-y-2.5 p-1">
        <div class="hs h-24 w-full rounded-xl"></div>
        <div class="hs h-24 w-full rounded-xl"></div>
      </div>
    </section>`
  ).join("");

  try {
    const jobId = qs("#job-filter").value;
    const body = await api.get(`/applications${qsParams({ group_by: "status", job_id: jobId })}`);
    grouped = body.data || {};
    STATUSES.forEach((s) => {
      if (!Array.isArray(grouped[s])) grouped[s] = [];
    });
    const total = STATUSES.reduce((sum, s) => sum + grouped[s].length, 0);
    if (!total) {
      boardInner.innerHTML = `<div class="w-full">${emptyState({
        title: "No candidates in the pipeline",
        description: "Applications appear here once candidates apply from the public careers page. Use the job filter to focus on one role.",
        icon: "ViewKanban",
      })}</div>`;
      return;
    }
    render();
  } catch (err) {
    toastError(err);
    boardInner.innerHTML = `<div class="w-full">${emptyState({
      title: "Could not load the pipeline",
      description: err.message,
      icon: "Error",
    })}</div>`;
  }
}

async function loadJobsFilter() {
  try {
    const body = await api.get("/jobs?per_page=100");
    const select = qs("#job-filter");
    (body.data || []).forEach((job) => {
      const opt = document.createElement("option");
      opt.value = String(job.id);
      opt.textContent = job.title;
      select.appendChild(opt);
    });
    const initial = new URLSearchParams(window.location.search).get("job_id");
    if (initial) select.value = initial;
  } catch {
    /* optional */
  }
}

qs("#job-filter").addEventListener("change", load);
qs("#refresh-btn").addEventListener("click", load);

await loadJobsFilter();
load();
