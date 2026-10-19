/* Candidate profile: overview, status control, match summary, resume, notes, history. */

import { api } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, formatDateTime, statusBadge, scoreBadge, scoreRing,
  avatarChip, confirmDialog, toast, toastError, emptyState, withBusy, qs,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "candidates", title: "Candidate Profile" });

const appId = window.location.pathname.split("/")[2];
const root = qs("#content");
const STATUSES = ["Applied", "Under Review", "Shortlisted", "Interview", "Hired", "Rejected"];
let app = null;

function render() {
  const match = app.match;
  root.innerHTML = `
    <a href="/candidates" class="inline-flex items-center gap-1.5 text-body-md font-semibold text-primary hover:underline">
      ${icon("ArrowLeft", { className: "text-[18px]" })} Back to candidates
    </a>

    <div class="grid gap-5 lg:grid-cols-3">
      <!-- Main column -->
      <div class="space-y-5 lg:col-span-2">
        <!-- Profile header -->
        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-start gap-4">
              ${avatarChip(app.candidate_name, { size: "h-14 w-14", text: "text-headline-sm" })}
              <div>
                <h1 class="font-headline-md text-headline-md text-on-surface">${escapeHtml(app.candidate_name)}</h1>
                <p class="mt-0.5 flex items-center gap-1.5 text-body-md text-on-surface-variant">
                  ${icon("Mail", { className: "text-[16px]" })}
                  <a href="mailto:${escapeHtml(app.email)}" class="hover:text-primary hover:underline">${escapeHtml(app.email)}</a>
                </p>
                ${app.phone ? `<p class="mt-0.5 flex items-center gap-1.5 text-body-md text-on-surface-variant">${icon("Phone", { className: "text-[16px]" })} ${escapeHtml(app.phone)}</p>` : ""}
                <p class="mt-1.5 text-body-sm text-on-surface-variant">
                  Applied for <a href="/jobs/${app.job_id}" class="font-semibold text-primary hover:underline">${escapeHtml(app.job_title)}</a>
                  · ${formatDate(app.created_at)} · Ref <span class="font-mono">${escapeHtml(app.public_reference || "—")}</span>
                </p>
              </div>
            </div>
            ${scoreRing(app.match_score, { size: 72, stroke: 6 })}
          </div>

          <!-- Status control -->
          <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-outline-variant pt-5">
            <label for="status-select" class="text-body-md font-semibold text-on-surface">Status</label>
            <select id="status-select"
                    class="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              ${STATUSES.map((s) => `<option ${s === app.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            <span id="status-current">${statusBadge(app.status)}</span>
            <div class="ml-auto flex flex-wrap gap-2">
              <a href="/candidates/${app.id}/match"
                 class="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary shadow-sm hover:bg-primary">
                ${icon("AutoAwesome", { className: "text-[18px]" })} Match analysis
              </a>
              <a href="/api/applications/${app.id}/resume" download
                 class="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">
                ${icon("Download", { className: "text-[18px]" })} Resume PDF
              </a>
            </div>
          </div>
        </section>

        <!-- Match snapshot -->
        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm" aria-labelledby="match-title">
          <div class="flex items-center justify-between">
            <h2 id="match-title" class="font-headline-sm text-headline-sm text-on-surface">AI match snapshot</h2>
            ${match ? `<span class="text-body-sm text-on-surface-variant">Analyzed ${formatDate(match.analyzed_at)}</span>` : ""}
          </div>
          ${match
            ? `<div class="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <p class="text-label-md uppercase tracking-wide text-on-surface-variant">Matched skills</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    ${(match.matched_skills || []).length
                      ? match.matched_skills.map((s) => `<span class="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-body-sm font-semibold text-success">${icon("Check", { className: "text-[13px]" })}${escapeHtml(s)}</span>`).join("")
                      : '<span class="text-body-sm text-on-surface-variant">None detected.</span>'}
                  </div>
                </div>
                <div>
                  <p class="text-label-md uppercase tracking-wide text-on-surface-variant">Skills not detected</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    ${(match.skills_not_detected || []).length
                      ? match.skills_not_detected.map((s) => `<span class="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-body-sm font-semibold text-warning">${icon("Cancel", { className: "text-[13px]" })}${escapeHtml(s)}</span>`).join("")
                      : '<span class="text-body-sm text-on-surface-variant">All required skills found.</span>'}
                  </div>
                </div>
              </div>
              <p class="mt-4 rounded-lg bg-surface-container-low p-4 text-body-md leading-6 text-on-surface-variant">${escapeHtml(match.explanation || "")}</p>`
            : `<div class="mt-4">${emptyState({
                title: "No analysis yet",
                description: "Run an analysis to compare this resume against the job requirements.",
                action: `<button type="button" id="run-analysis-empty" class="rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary hover:bg-primary">Run analysis</button>`,
                icon: "AutoAwesome",
              })}</div>`}
        </section>

        <!-- Resume text -->
        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm" aria-labelledby="resume-title">
          <div class="flex items-center justify-between">
            <h2 id="resume-title" class="font-headline-sm text-headline-sm text-on-surface">Resume text</h2>
            <span class="text-body-sm text-on-surface-variant">${(app.resume_text_length ?? 0).toLocaleString()} characters</span>
          </div>
          <pre id="resume-text" class="thin-scroll mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-container p-4 font-body text-body-md leading-6 text-on-surface-variant">${escapeHtml(app.resume_text_preview || "No resume text available.")}</pre>
          ${(app.resume_text_length ?? 0) > 4000
            ? `<p class="mt-2 text-body-sm text-on-surface-variant">Showing the first 4,000 characters. Download the PDF for the complete resume.</p>`
            : ""}
        </section>

        <!-- Notes -->
        <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm" aria-labelledby="notes-title">
          <h2 id="notes-title" class="font-headline-sm text-headline-sm text-on-surface">Recruiter notes</h2>
          <form id="note-form" class="mt-4 flex gap-3">
            <textarea id="note-input" rows="2" maxlength="2000" placeholder="Add a note for the hiring team…"
                      class="flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"></textarea>
            <button type="submit" class="self-end rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary shadow-sm hover:bg-primary">
              ${icon("Send", { className: "text-[18px]" })} Add note
            </button>
          </form>
          <ul id="notes-list" class="mt-5 space-y-3"></ul>
        </section>
      </div>

      <!-- Sidebar -->
      <aside class="space-y-5">
        <div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Status history</h2>
          <ol id="history-list" class="mt-4 space-y-4"></ol>
        </div>

        <div class="rounded-xl border border-error/25 bg-error-container/40 p-5 shadow-sm">
          <div class="flex items-center gap-2 text-on-error-container">
            ${icon("Delete", { className: "text-[20px]" })}
            <h2 class="font-headline-sm text-headline-sm">Delete application</h2>
          </div>
          <p class="mt-2 text-body-md leading-6 text-on-error-container/80">
            Removes this application, its notes, and match analyses from the workspace.
          </p>
          <button type="button" id="delete-app"
                  class="mt-4 w-full rounded-lg bg-error px-4 py-2.5 text-body-md font-semibold text-on-primary hover:opacity-90">
            Delete application
          </button>
        </div>
      </aside>
    </div>`;

  // Status change
  qs("#status-select").addEventListener("change", async (event) => {
    const next = event.target.value;
    if (next === app.status) return;
    try {
      await api.patch(`/applications/${app.id}/status`, { status: next });
      app.status = next;
      qs("#status-current").innerHTML = statusBadge(next);
      toast(`Status updated to “${next}”.`, "success");
      await loadHistory();
    } catch (err) {
      toastError(err);
      event.target.value = app.status;
    }
  });

  // Notes
  qs("#note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = qs("#note-input");
    const note = input.value.trim();
    if (!note) return;
    try {
      const body = await api.post(`/applications/${app.id}/notes`, { note });
      input.value = "";
      renderNotes([body.data, ...(app.notes || [])]);
      toast("Note added.", "success");
    } catch (err) {
      toastError(err);
    }
  });

  // Run analysis
  const runAnalysis = async (button) => {
    try {
      await withBusy(button, async () => {
        const body = await api.post(`/applications/${app.id}/analyze`);
        app.match = body.data;
        app.match_score = body.data.similarity_score;
      });
      toast("Analysis complete.", "success");
      await load();
    } catch (err) {
      toastError(err);
    }
  };
  qs("#run-analysis-empty")?.addEventListener("click", (e) => runAnalysis(e.currentTarget));

  // Delete application
  qs("#delete-app").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete this application?",
      message:
        "This permanently removes the candidate's application, resume reference, notes, and match analyses. This cannot be undone.",
      confirmLabel: "Delete Application",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/applications/${app.id}`);
      toast("Application deleted.", "success");
      window.location.href = "/candidates";
    } catch (err) {
      toastError(err);
    }
  });

  renderNotes(app.notes || []);
  renderHistory(app.status_history || []);
}

function renderNotes(notes) {
  const list = qs("#notes-list");
  if (!notes.length) {
    list.innerHTML = `<li class="text-body-md text-on-surface-variant">No notes yet.</li>`;
    return;
  }
  list.innerHTML = notes
    .map(
      (n) => `<li class="rounded-lg bg-surface-container-low p-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-body-md font-semibold text-on-surface">${escapeHtml(n.recruiter_name || "Recruiter")}</span>
          <span class="text-body-sm text-on-surface-variant">${formatDateTime(n.created_at)}</span>
        </div>
        <p class="mt-1.5 whitespace-pre-line text-body-md leading-6 text-on-surface-variant">${escapeHtml(n.note)}</p>
      </li>`
    )
    .join("");
}

function renderHistory(history) {
  const list = qs("#history-list");
  if (!history.length) {
    list.innerHTML = `<li class="text-body-md text-on-surface-variant">No status changes recorded.</li>`;
    return;
  }
  list.innerHTML = history
    .map(
      (h) => `<li class="relative flex gap-3">
        <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary-container" aria-hidden="true"></span>
        <div>
          <p class="text-body-md text-on-surface">
            ${h.old_status ? `${escapeHtml(h.old_status)} → ` : ""}<span class="font-semibold">${escapeHtml(h.new_status)}</span>
          </p>
          <p class="text-body-sm text-on-surface-variant">${formatDateTime(h.created_at)}</p>
        </div>
      </li>`
    )
    .join("");
}

async function loadHistory() {
  try {
    const body = await api.get(`/applications/${app.id}`);
    app.status_history = body.data.status_history || [];
    app.notes = body.data.notes || app.notes;
    renderHistory(app.status_history);
  } catch {
    /* non-critical */
  }
}

async function load() {
  root.innerHTML = `<div class="space-y-4">
    <div class="hs h-6 w-40"></div>
    <div class="grid gap-5 lg:grid-cols-3">
      <div class="space-y-5 lg:col-span-2">
        <div class="hs h-44 w-full rounded-xl"></div>
        <div class="hs h-40 w-full rounded-xl"></div>
        <div class="hs h-64 w-full rounded-xl"></div>
      </div>
      <div class="space-y-5"><div class="hs h-56 w-full rounded-xl"></div></div>
    </div>
  </div>`;
  try {
    const body = await api.get(`/applications/${appId}`);
    app = body.data;
    document.title = `${app.candidate_name} · HireSense AI`;
    render();
  } catch (err) {
    root.innerHTML = emptyState({
      title: err.status === 404 ? "Candidate not found" : "Could not load this candidate",
      description: err.message,
      action: `<a href="/candidates" class="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary">${icon("ArrowLeft", { className: "text-[18px]" })} Back to candidates</a>`,
    });
  }
}

load();
