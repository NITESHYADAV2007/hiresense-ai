/* Candidates list: search/filter/sort/pagination + CSV export. */

import { api, qs as qsParams } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, statusBadge, scoreBadge, avatarChip,
  emptyState, skeletonRows, paginationMarkup, toast, toastError, qs, qsa,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "candidates", title: "Candidates" });

const state = {
  search: "", job_id: "", status: "", sort: "newest", page: 1,
};

// Deep-link support: /candidates?search=… and /candidates?job_id=…
const initial = new URLSearchParams(window.location.search);
if (initial.get("search")) state.search = initial.get("search");
if (initial.get("job_id")) state.job_id = initial.get("job_id");
if (initial.get("status")) state.status = initial.get("status");

const bodyEl = qs("#apps-body");
const paginationEl = qs("#pagination");

async function loadJobsFilter() {
  try {
    const body = await api.get("/jobs?per_page=100");
    const select = qs('#filters select[name="job_id"]');
    (body.data || []).forEach((job) => {
      const opt = document.createElement("option");
      opt.value = String(job.id);
      opt.textContent = job.title;
      select.appendChild(opt);
    });
    select.value = state.job_id;
  } catch {
    /* optional */
  }
}

function renderRows(apps) {
  if (!apps.length) {
    bodyEl.innerHTML = `<tr><td colspan="6" class="px-5 py-12">${emptyState({
      title: "No candidates found",
      description:
        state.search || state.job_id || state.status
          ? "Try adjusting or clearing the filters above."
          : "Applications appear here once candidates apply from the public careers page.",
      icon: "Group",
    })}</td></tr>`;
    return;
  }
  bodyEl.innerHTML = apps
    .map(
      (app) => `<tr class="hover:bg-surface-container-low/60">
        <td class="px-5 py-3.5">
          <a href="/candidates/${app.id}" class="flex items-center gap-3 hover:text-primary">
            ${avatarChip(app.candidate_name)}
            <span class="min-w-0">
              <span class="block truncate font-semibold text-on-surface">${escapeHtml(app.candidate_name)}</span>
              <span class="block truncate text-body-sm text-on-surface-variant">${escapeHtml(app.email)}</span>
            </span>
          </a>
        </td>
        <td class="px-5 py-3.5 text-on-surface-variant">${escapeHtml(app.job_title)}</td>
        <td class="px-5 py-3.5">${scoreBadge(app.match_score)}</td>
        <td class="px-5 py-3.5">${statusBadge(app.status)}</td>
        <td class="px-5 py-3.5 text-on-surface-variant">${formatDate(app.created_at)}</td>
        <td class="px-5 py-3.5">
          <div class="flex items-center justify-end gap-1.5">
            <a href="/candidates/${app.id}" class="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-on-surface-variant hover:bg-primary-container hover:text-on-primary" title="View profile">
              ${icon("Eye", { className: "text-[18px]" })}<span class="sr-only">View</span>
            </a>
            <a href="/candidates/${app.id}/match" class="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-on-surface-variant hover:bg-primary-container hover:text-on-primary" title="View match analysis">
              ${icon("AutoAwesome", { className: "text-[18px]" })}<span class="sr-only">Match</span>
            </a>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

async function load() {
  bodyEl.innerHTML = skeletonRows(6, 6);
  try {
    const body = await api.get(`/applications${qsParams(state)}`);
    const apps = body.data || [];
    qs("#total-count").textContent = body.meta?.total ?? apps.length;
    renderRows(apps);
    paginationEl.innerHTML = paginationMarkup(body.meta || { page: 1, total_pages: 1, total: apps.length });
    qsa("#pagination [data-action='page']").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.page = Number(btn.dataset.page);
        load();
      })
    );
  } catch (err) {
    toastError(err);
    bodyEl.innerHTML = `<tr><td colspan="6" class="px-5 py-12">${emptyState({
      title: "Could not load candidates",
      description: err.message,
    })}</td></tr>`;
  }
}

let debounce;
qs("#filters").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const data = new FormData(qs("#filters"));
    state.search = (data.get("search") || "").toString().trim();
    state.job_id = (data.get("job_id") || "").toString();
    state.status = (data.get("status") || "").toString();
    state.sort = (data.get("sort") || "newest").toString();
    state.page = 1;
    load();
  }, 300);
});
qs("#filters").addEventListener("change", () => {
  const data = new FormData(qs("#filters"));
  state.job_id = (data.get("job_id") || "").toString();
  state.status = (data.get("status") || "").toString();
  state.sort = (data.get("sort") || "newest").toString();
  state.page = 1;
  load();
});
qs("#filters").addEventListener("submit", (e) => e.preventDefault());

// Prefill filter controls from deep links.
qs('#filters input[name="search"]').value = state.search;
qs('#filters select[name="status"]').value = state.status;

qs("#export-btn").addEventListener("click", async () => {
  try {
    const res = await api.download(`/applications/export${qsParams(state)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Export failed (${res.status}).`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hiresense-applications.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("CSV export downloaded.", "success");
  } catch (err) {
    toastError(err);
  }
});

await loadJobsFilter();
load();
