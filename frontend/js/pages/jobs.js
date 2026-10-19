/* Recruiter jobs listing: filters, sorting, pagination, row actions. */

import { api, qs as qsParams } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, statusBadge, confirmDialog, toast, toastError,
  emptyState, skeletonRows, paginationMarkup, qsa, qs,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "jobs", title: "Job Openings" });

const state = { search: "", status: "", department: "", location: "", sort: "newest", page: 1, per_page: 10 };

const bodyEl = qs("#jobs-body");
const paginationEl = qs("#pagination");

async function loadMeta() {
  try {
    const body = await api.get("/jobs/meta");
    const fill = (id, values, placeholder) => {
      const select = qs(id);
      select.innerHTML = `<option value="">${placeholder}</option>` +
        values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    };
    fill("#department", body.data.departments, "All departments");
    fill("#location", body.data.locations, "All locations");
    // restore current selections
    qs("#department").value = state.department;
    qs("#location").value = state.location;
  } catch {
    /* filter options are optional */
  }
}

function actionsMenu(job) {
  const nextStatus =
    job.status === "open"
      ? { label: "Close Job", value: "closed", danger: true }
      : { label: "Reopen Job", value: "open", danger: false };
  const iconBtn =
    "inline-flex items-center rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-on-surface hover:bg-surface-container-low";
  return `
    <div class="flex items-center justify-end gap-1.5">
      <a href="/jobs/${job.id}" class="${iconBtn}" title="View job">${icon("Eye", { className: "text-[16px]" })}<span class="sr-only">View</span></a>
      <a href="/jobs/${job.id}/edit" class="${iconBtn}" title="Edit job">${icon("Pencil", { className: "text-[16px]" })}<span class="sr-only">Edit</span></a>
      <a href="/candidates?job_id=${job.id}" class="${iconBtn}" title="View applicants">${icon("Users", { className: "text-[16px]" })}<span class="sr-only">Applicants</span></a>
      ${job.status !== "archived"
        ? `<button type="button" data-status-job="${job.id}" data-next="${nextStatus.value}" data-label="${nextStatus.label}"
              class="inline-flex items-center rounded-lg px-2.5 py-1.5 ${nextStatus.danger ? "bg-danger-soft text-danger hover:bg-danger hover:text-on-error" : "bg-success-soft text-success hover:bg-success hover:text-on-error"}" title="${nextStatus.label}">
              ${icon(nextStatus.danger ? "Lock" : "RefreshCw", { className: "text-[16px]" })}<span class="sr-only">${nextStatus.label}</span>
            </button>`
        : ""}
      ${job.status !== "archived"
        ? `<button type="button" data-archive-job="${job.id}"
              class="inline-flex items-center rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-on-surface-variant hover:bg-surface-container-low" title="Archive job">
              ${icon("Trash", { className: "text-[16px]" })}<span class="sr-only">Archive</span>
            </button>`
        : ""}
    </div>`;
}

function renderRows(jobs) {
  if (!jobs.length) {
    bodyEl.innerHTML = `<tr><td colspan="8" class="px-5 py-12">${emptyState({
      title: "No jobs match your filters",
      description:
        state.search || state.status || state.department || state.location
          ? "Try adjusting or clearing the filters above."
          : "Create your first job opening — candidates can then find it on the public careers page and apply with a resume.",
      action:
        state.search || state.status || state.department || state.location
          ? `<button type="button" id="clear-inline" class="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">Clear filters</button>`
          : `<a href="/jobs/new" class="rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary hover:bg-primary">Create Job</a>`,
    })}</td></tr>`;
    qs("#clear-inline")?.addEventListener("click", clearFilters);
    return;
  }

  bodyEl.innerHTML = jobs
    .map(
      (job) => `<tr class="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
        <td class="px-5 py-3.5">
          <a href="/jobs/${job.id}" class="font-semibold text-on-surface hover:text-primary hover:underline">${escapeHtml(job.title)}</a>
        </td>
        <td class="px-5 py-3.5 text-on-surface-variant">${escapeHtml(job.department)}</td>
        <td class="px-5 py-3.5 text-on-surface-variant">${escapeHtml(job.location)}</td>
        <td class="px-5 py-3.5 text-on-surface-variant">${escapeHtml(job.employment_type)}</td>
        <td class="px-5 py-3.5">${statusBadge(job.status)}</td>
        <td class="px-5 py-3.5">
          <a href="/candidates?job_id=${job.id}" class="font-semibold text-on-surface hover:text-primary hover:underline">${job.applicant_count ?? 0}</a>
        </td>
        <td class="px-5 py-3.5 text-on-surface-variant">${formatDate(job.created_at)}</td>
        <td class="px-5 py-3.5">${actionsMenu(job)}</td>
      </tr>`
    )
    .join("");

  qsa("[data-status-job]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.statusJob;
      const next = btn.dataset.next;
      const label = btn.dataset.label;
      const ok = await confirmDialog({
        title: `${label}?`,
        message:
          next === "closed"
            ? "Closing this job hides it from the public careers page and stops new applications. Existing applications are kept."
            : "Reopening this job makes it visible on the public careers page again so candidates can apply.",
        confirmLabel: label,
        danger: next === "closed",
      });
      if (!ok) return;
      try {
        await api.patch(`/jobs/${id}/status`, { status: next });
        toast(`Job ${next === "closed" ? "closed" : "reopened"}.`, "success");
        load();
      } catch (err) {
        toastError(err);
      }
    })
  );

  qsa("[data-archive-job]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.archiveJob;
      const ok = await confirmDialog({
        title: "Archive this job?",
        message:
          "Archived jobs are hidden from the careers page and from the default job list. Applications and their history are preserved.",
        confirmLabel: "Archive Job",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.patch(`/jobs/${id}/status`, { status: "archived" });
        toast("Job archived.", "success");
        load();
      } catch (err) {
        toastError(err);
      }
    })
  );
}

async function load() {
  bodyEl.innerHTML = skeletonRows(6, 8);
  try {
    const body = await api.get(`/jobs${qsParams(state)}`);
    const jobs = body.data || [];
    qs("#total-count").textContent = body.meta?.total ?? jobs.length;
    renderRows(jobs);
    paginationEl.innerHTML = paginationMarkup(body.meta || { page: 1, total_pages: 1, total: jobs.length });
    qsa("#pagination [data-action='page']").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.page = Number(btn.dataset.page);
        load();
      })
    );
  } catch (err) {
    toastError(err);
    bodyEl.innerHTML = `<tr><td colspan="8" class="px-5 py-12">${emptyState({
      title: "Could not load jobs",
      description: err.message,
    })}</td></tr>`;
  }
}

function clearFilters() {
  Object.assign(state, { search: "", status: "", department: "", location: "", sort: "newest", page: 1 });
  qs("#filters").reset();
  load();
}

let debounce;
qs("#filters").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const data = new FormData(qs("#filters"));
    state.search = (data.get("search") || "").toString().trim();
    state.status = (data.get("status") || "").toString();
    state.department = (data.get("department") || "").toString();
    state.location = (data.get("location") || "").toString();
    state.sort = (data.get("sort") || "newest").toString();
    state.page = 1;
    load();
  }, 300);
});
qs("#filters").addEventListener("change", () => {
  const data = new FormData(qs("#filters"));
  state.status = (data.get("status") || "").toString();
  state.department = (data.get("department") || "").toString();
  state.location = (data.get("location") || "").toString();
  state.sort = (data.get("sort") || "newest").toString();
  state.page = 1;
  load();
});
qs("#filters").addEventListener("submit", (event) => event.preventDefault());

// Support ?status=open deep links (e.g. from the dashboard).
const initial = new URLSearchParams(window.location.search);
if (initial.get("status")) state.status = initial.get("status");

await loadMeta();
load();
