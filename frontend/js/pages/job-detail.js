/* Job detail: full job info, actions (edit/close/archive/delete), applicants list. */

import { api } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, statusBadge, scoreBadge, avatarChip,
  confirmDialog, toast, toastError, emptyState, skeletonRows,
  paginationMarkup, qs, qsa, withBusy,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "jobs", title: "Job Detail" });

const jobId = window.location.pathname.split("/")[2];
const root = qs("#content");
let job = null;

function headerActions() {
  if (!job) return "";
  const nextStatus =
    job.status === "open"
      ? { label: "Close Job", value: "closed", danger: true }
      : { label: "Reopen Job", value: "open", danger: false };
  return `
    <a href="/careers/${job.id}" target="_blank" rel="noopener"
       class="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">
      ${icon("ExternalLink", { className: "text-[18px]" })} Public page
    </a>
    <a href="/jobs/${job.id}/edit"
       class="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">
      ${icon("Pencil", { className: "text-[18px]" })} Edit
    </a>
    <button type="button" id="toggle-status"
       class="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-body-md font-semibold shadow-sm ${
         nextStatus.danger
           ? "bg-error-container text-on-error-container hover:opacity-90"
           : "bg-success-soft text-success hover:opacity-90"
       }">
      ${icon(nextStatus.danger ? "Lock" : "RefreshCw", { className: "text-[18px]" })} ${nextStatus.label}
    </button>
    <button type="button" id="delete-job"
       class="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2.5 text-body-md font-semibold text-on-primary hover:opacity-90">
      ${icon("Trash", { className: "text-[18px]" })} Delete
    </button>`;
}

function render() {
  if (!job) return;
  root.innerHTML = `
    <a href="/jobs" class="inline-flex items-center gap-1.5 text-body-md font-semibold text-primary hover:underline">
      ${icon("ArrowLeft", { className: "text-[18px]" })} Back to jobs
    </a>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="font-headline-lg text-headline-lg text-on-surface">${escapeHtml(job.title)}</h1>
          ${statusBadge(job.status)}
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-md text-on-surface-variant">
          <span class="flex items-center gap-1">${icon("Business", { className: "text-[16px]" })} ${escapeHtml(job.department)}</span>
          <span class="flex items-center gap-1">${icon("Place", { className: "text-[16px]" })} ${escapeHtml(job.location)}</span>
          <span class="flex items-center gap-1">${icon("Schedule", { className: "text-[16px]" })} ${escapeHtml(job.employment_type)}</span>
          <span class="flex items-center gap-1">${icon("WorkspacePremium", { className: "text-[16px]" })} ${escapeHtml(job.experience_level || "—")}</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2" id="header-actions">${headerActions()}</div>
    </div>

    <div class="grid gap-5 lg:grid-cols-3">
      <div class="space-y-5 lg:col-span-2">
        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Description</h2>
          <p class="mt-3 whitespace-pre-line text-body-md leading-7 text-on-surface-variant">${escapeHtml(job.description)}</p>
        </section>

        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Required skills</h2>
          <div class="mt-3 flex flex-wrap gap-2">
            ${(job.required_skills || []).length
              ? job.required_skills
                  .map((s) => `<span class="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-3 py-1.5 text-body-sm font-semibold text-on-primary-fixed-variant">${icon("Check", { className: "text-[14px]" })}${escapeHtml(s)}</span>`)
                  .join("")
              : '<p class="text-body-md text-on-surface-variant">No skills listed.</p>'}
          </div>
        </section>

        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm" aria-labelledby="applicants-title">
          <div class="flex items-center justify-between border-b border-outline-variant px-6 py-4">
            <h2 id="applicants-title" class="font-headline-sm text-headline-sm text-on-surface">
              Applicants <span id="applicant-count" class="ml-1 rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm text-on-surface-variant">${job.applicant_count ?? 0}</span>
            </h2>
            <a href="/pipeline?job_id=${job.id}" class="text-body-md font-semibold text-primary hover:underline">Pipeline view</a>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-body-md">
              <thead class="border-b border-outline-variant bg-surface-container-low text-label-md uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th scope="col" class="px-6 py-3">Candidate</th>
                  <th scope="col" class="px-6 py-3">Match</th>
                  <th scope="col" class="px-6 py-3">Status</th>
                  <th scope="col" class="px-6 py-3">Applied</th>
                  <th scope="col" class="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody id="applicants-body" class="divide-y divide-outline-variant">${skeletonRows(4, 5)}</tbody>
            </table>
          </div>
          <div id="applicants-pagination" class="px-6 pb-5"></div>
        </section>
      </div>

      <aside class="space-y-5">
        <div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Job facts</h2>
          <dl class="mt-4 space-y-3 text-body-md">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-on-surface-variant">Applicants</dt>
              <dd class="font-semibold text-on-surface">${job.applicant_count ?? 0}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-on-surface-variant">Created</dt>
              <dd class="font-semibold text-on-surface">${formatDate(job.created_at)}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-on-surface-variant">Updated</dt>
              <dd class="font-semibold text-on-surface">${formatDate(job.updated_at)}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-on-surface-variant">Job ID</dt>
              <dd class="font-mono text-body-sm text-on-surface-variant">#${job.id}</dd>
            </div>
          </dl>
        </div>

        <div class="rounded-xl border border-outline-variant bg-primary-fixed/40 p-5 shadow-sm">
          <div class="flex items-center gap-2 text-on-primary-fixed-variant">
            ${icon("AutoAwesome", { className: "text-[20px]" })}
            <h2 class="font-headline-sm text-headline-sm">Hiring tip</h2>
          </div>
          <p class="mt-2 text-body-md leading-6 text-on-surface-variant">
            Share the public page link to collect applications. Every new resume is
            scored automatically — review the match analysis before moving anyone forward.
          </p>
        </div>
      </aside>
    </div>`;

  qs("#toggle-status")?.addEventListener("click", async () => {
    const next = job.status === "open" ? "closed" : "open";
    const ok = await confirmDialog({
      title: next === "closed" ? "Close this job?" : "Reopen this job?",
      message:
        next === "closed"
          ? "Closing hides the job from the public careers page and stops new applications. Existing applications are kept."
          : "Reopening makes the job visible on the public careers page again so candidates can apply.",
      confirmLabel: next === "closed" ? "Close Job" : "Reopen Job",
      danger: next === "closed",
    });
    if (!ok) return;
    try {
      await api.patch(`/jobs/${job.id}/status`, { status: next });
      toast(`Job ${next === "closed" ? "closed" : "reopened"}.`, "success");
      await load();
    } catch (err) {
      toastError(err);
    }
  });

  qs("#delete-job")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete this job permanently?",
      message:
        "This removes the job AND all of its applications, resumes, notes, and match analyses. This cannot be undone.",
      confirmLabel: "Delete Job & Applications",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/jobs/${job.id}`);
      toast("Job deleted.", "success");
      window.location.href = "/jobs";
    } catch (err) {
      toastError(err);
    }
  });
}

const appPage = { page: 1 };

async function loadApplicants() {
  const body = qs("#applicants-body");
  try {
    const res = await api.get(`/jobs/${job.id}/applications?page=${appPage.page}&per_page=8`);
    const apps = res.data || [];
    if (!apps.length) {
      body.innerHTML = `<tr><td colspan="5" class="px-6 py-10">${emptyState({
        title: "No applicants yet",
        description: "Candidates apply from the public careers page — share the job link to get started.",
        icon: "Group",
      })}</td></tr>`;
      qs("#applicants-pagination").innerHTML = "";
      return;
    }
    body.innerHTML = apps
      .map(
        (app) => `<tr class="hover:bg-surface-container-low/60">
          <td class="px-6 py-3.5">
            <a href="/candidates/${app.id}" class="flex items-center gap-3 hover:text-primary">
              ${avatarChip(app.candidate_name)}
              <span>
                <span class="block font-semibold text-on-surface">${escapeHtml(app.candidate_name)}</span>
                <span class="block text-body-sm text-on-surface-variant">${escapeHtml(app.email)}</span>
              </span>
            </a>
          </td>
          <td class="px-6 py-3.5">${scoreBadge(app.match_score)}</td>
          <td class="px-6 py-3.5">${statusBadge(app.status)}</td>
          <td class="px-6 py-3.5 text-on-surface-variant">${formatDate(app.created_at)}</td>
          <td class="px-6 py-3.5 text-right">
            <a href="/candidates/${app.id}" class="rounded-lg bg-primary-container px-3 py-1.5 text-body-sm font-semibold text-on-primary hover:bg-primary">View</a>
          </td>
        </tr>`
      )
      .join("");
    qs("#applicants-pagination").innerHTML = paginationMarkup(res.meta || {}, 'data-action="page"');
    qsa("#applicants-pagination [data-action='page']").forEach((btn) =>
      btn.addEventListener("click", () => {
        appPage.page = Number(btn.dataset.page);
        loadApplicants();
      })
    );
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="px-6 py-10">${emptyState({
      title: "Could not load applicants",
      description: err.message,
    })}</td></tr>`;
  }
}

async function load() {
  root.innerHTML = `<div class="space-y-4">
    <div class="hs h-6 w-40"></div>
    <div class="hs h-10 w-96 max-w-full"></div>
    <div class="grid gap-5 lg:grid-cols-3">
      <div class="space-y-5 lg:col-span-2">
        <div class="hs h-48 w-full rounded-xl"></div>
        <div class="hs h-40 w-full rounded-xl"></div>
      </div>
      <div class="hs h-64 w-full rounded-xl"></div>
    </div>
  </div>`;
  try {
    const body = await api.get(`/jobs/${jobId}`);
    job = body.data;
    render();
    loadApplicants();
  } catch (err) {
    if (err.status === 404) {
      root.innerHTML = emptyState({
        title: "Job not found",
        description: "This job does not exist or you do not have access to it.",
        action: `<a href="/jobs" class="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary">${icon("ArrowLeft", { className: "text-[18px]" })} Back to jobs</a>`,
        icon: "SearchOff",
      });
      return;
    }
    toastError(err);
    root.innerHTML = emptyState({
      title: "Could not load this job",
      description: err.message,
      action: `<button type="button" onclick="location.reload()" class="rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary">Try again</button>`,
    });
  }
}

load();
