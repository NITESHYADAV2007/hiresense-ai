/* Match analysis page: score ring, skills, explanation, reanalyze action. */

import { api } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import {
  escapeHtml, formatDate, scoreRing, avatarChip, toast, toastError,
  emptyState, withBusy, qs,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "candidates", title: "Match Analysis" });

const appId = window.location.pathname.split("/")[2];
const root = qs("#content");
let app = null;

function verdict(score) {
  if (score >= 70) return { label: "Strong match", tone: "bg-success-soft text-success", ic: "TrendingUp" };
  if (score >= 45) return { label: "Moderate match", tone: "bg-warning-soft text-warning", ic: "TrendingUp" };
  return { label: "Low match", tone: "bg-danger-soft text-danger", ic: "TrendingDown" };
}

function render() {
  const match = app.match;
  const score = match ? match.similarity_score : app.match_score;
  const v = verdict(score ?? 0);

  root.innerHTML = `
    <a href="/candidates/${app.id}" class="inline-flex items-center gap-1.5 text-body-md font-semibold text-primary hover:underline">
      ${icon("ArrowLeft", { className: "text-[18px]" })} Back to ${escapeHtml(app.candidate_name)}
    </a>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        ${avatarChip(app.candidate_name, { size: "h-12 w-12", text: "text-headline-sm" })}
        <div>
          <h1 class="font-headline-md text-headline-md text-on-surface">Match analysis</h1>
          <p class="text-body-md text-on-surface-variant">
            ${escapeHtml(app.candidate_name)} ·
            <a href="/jobs/${app.job_id}" class="font-semibold text-primary hover:underline">${escapeHtml(app.job_title)}</a>
          </p>
        </div>
      </div>
      <button type="button" id="reanalyze"
              class="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary shadow-sm hover:bg-primary">
        ${icon("RefreshCw", { className: "text-[18px]" })} Reanalyze
      </button>
    </div>

    ${match
      ? `<div class="grid gap-5 lg:grid-cols-3">
          <!-- Score card -->
          <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-sm">
            ${scoreRing(match.similarity_score, { size: 128, stroke: 10 })}
            <span class="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-md font-semibold ${v.tone}">
              ${icon(v.ic, { className: "text-[16px]" })} ${v.label}
            </span>
            <p class="mt-3 text-body-sm leading-5 text-on-surface-variant">
              ${match.engine === "embeddings"
                ? "Semantic AI matching: MiniLM embeddings plus required-skill overlap, expressed as a percentage."
                : "TF-IDF cosine similarity between the job description and the resume text, expressed as a percentage."}
            </p>
            <p class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-1 text-label-sm font-semibold text-on-primary-fixed-variant">
              ${match.engine === "embeddings" ? "Semantic AI · embeddings" : "Classical NLP · TF-IDF"}
            </p>
            <p class="mt-3 text-body-sm text-on-surface-variant">Analyzed ${formatDate(match.analyzed_at)}</p>
          </section>

          <!-- Skills -->
          <section class="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm lg:col-span-2">
            <h2 class="font-headline-sm text-headline-sm text-on-surface">Skill comparison</h2>
            <div class="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p class="flex items-center gap-1.5 text-label-md uppercase tracking-wide text-success">
                  ${icon("CheckCircle", { className: "text-[16px]" })} Matched (${(match.matched_skills || []).length})
                </p>
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  ${(match.matched_skills || []).length
                    ? match.matched_skills.map((s) => `<span class="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1.5 text-body-sm font-semibold text-success">${icon("Check", { className: "text-[14px]" })}${escapeHtml(s)}</span>`).join("")
                    : '<span class="text-body-md text-on-surface-variant">No required skills were detected in the resume.</span>'}
                </div>
              </div>
              <div>
                <p class="flex items-center gap-1.5 text-label-md uppercase tracking-wide text-warning">
                  ${icon("Cancel", { className: "text-[16px]" })} Not detected (${(match.skills_not_detected || []).length})
                </p>
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  ${(match.skills_not_detected || []).length
                    ? match.skills_not_detected.map((s) => `<span class="inline-flex items-center gap-1 rounded-full bg-warning-soft px-3 py-1.5 text-body-sm font-semibold text-warning">${icon("Close", { className: "text-[14px]" })}${escapeHtml(s)}</span>`).join("")
                    : '<span class="text-body-md text-on-surface-variant">All required skills were detected.</span>'}
                </div>
              </div>
            </div>

            <div class="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-5">
              <p class="flex items-center gap-1.5 text-label-md uppercase tracking-wide text-on-surface-variant">
                ${icon("Psychology", { className: "text-[16px] text-primary" })} How this score was computed
              </p>
              <p class="mt-2 whitespace-pre-line text-body-md leading-6 text-on-surface-variant">${escapeHtml(match.explanation || "")}</p>
            </div>

            <div class="mt-5 flex items-start gap-2 rounded-xl bg-warning-soft/60 p-4 text-body-md leading-6 text-warning">
              ${icon("GppMaybe", { className: "mt-0.5 shrink-0 text-[20px]" })}
              <p>
                <span class="font-semibold">Decision support only.</span>
                This score reflects textual similarity — not experience quality, culture fit,
                or potential. Never auto-reject based on a score; review the full resume and
                talk to the person.
              </p>
            </div>
          </section>
        </div>`
      : emptyState({
          title: "No analysis has been run yet",
          description:
            "Run an analysis to compare this resume against the job description using TF-IDF similarity and explicit skill detection.",
          action: `<button type="button" id="run-analysis" class="rounded-lg bg-primary-container px-5 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary">${icon("AutoAwesome", { className: "mr-1 inline text-[18px]" })} Run analysis</button>`,
          icon: "AutoAwesome",
        })}
  `;

  const run = async (button) => {
    try {
      await withBusy(button, async () => {
        const body = await api.post(`/applications/${app.id}/analyze`);
        app.match = body.data;
        app.match_score = body.data.similarity_score;
      });
      toast("Analysis complete.", "success");
      render();
    } catch (err) {
      toastError(err);
    }
  };
  qs("#reanalyze")?.addEventListener("click", (e) => run(e.currentTarget));
  qs("#run-analysis")?.addEventListener("click", (e) => run(e.currentTarget));
}

async function load() {
  root.innerHTML = `<div class="space-y-4">
    <div class="hs h-6 w-48"></div>
    <div class="grid gap-5 lg:grid-cols-3">
      <div class="hs h-64 w-full rounded-xl"></div>
      <div class="hs h-64 w-full rounded-xl lg:col-span-2"></div>
    </div>
  </div>`;
  try {
    const body = await api.get(`/applications/${appId}`);
    app = body.data;
    document.title = `Match · ${app.candidate_name} · HireSense AI`;
    try {
      const matchBody = await api.get(`/applications/${appId}/match`);
      app.match = matchBody.data;
    } catch {
      app.match = null; // no analysis yet — page offers "Run analysis"
    }
    render();
  } catch (err) {
    root.innerHTML = emptyState({
      title: err.status === 404 ? "Candidate not found" : "Could not load analysis",
      description: err.message,
      action: `<a href="/candidates" class="rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary">Back to candidates</a>`,
    });
  }
}

load();
