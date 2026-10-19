/* Recruiter dashboard: real metrics, trends, and recent records from the API. */

import { api } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import { lineChart, donutChart } from "/js/charts.js";
import {
  escapeHtml, formatDate, longDate, statusBadge, scoreBadge, metricCard,
  emptyState, toastError, qs,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "dashboard", title: "Recruitment Overview" });

qs("#today-date").textContent = longDate();

const METRICS = [
  { key: "open_jobs", label: "Open Jobs", iconName: "Work", tone: "primary" },
  { key: "total_applications", label: "Total Applications", iconName: "Inbox", tone: "secondary" },
  { key: "shortlisted", label: "Shortlisted", iconName: "Star", tone: "tertiary" },
  { key: "interviews", label: "Interviews", iconName: "CalendarMonth", tone: "success" },
];

function renderMetrics(summary) {
  qs("#metrics").innerHTML = METRICS.map((metric) =>
    metricCard({ label: metric.label, value: summary[metric.key] ?? 0, iconName: metric.iconName, tone: metric.tone })
  ).join("");
}

function renderQuickActions(hasJobs) {
  const secondary =
    "inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low";
  qs("#quick-actions").innerHTML = `
    <a href="/jobs/new" class="${secondary}">
      ${icon("Plus", { className: "text-[18px]" })} Create Job
    </a>
    <a href="/candidates" class="${secondary}">
      ${icon("Users", { className: "text-[18px]" })} View Candidates
    </a>
    <a href="/pipeline" class="${secondary}">
      ${icon("GitBranch", { className: "text-[18px]" })} Open Pipeline
    </a>
    ${hasJobs ? "" : `<a href="/jobs/new" class="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary shadow-sm hover:bg-primary">${icon("Sparkles", { className: "text-[18px]" })} Create your first job</a>`}`;
}

function renderRecentApps(apps) {
  const body = qs("#recent-apps-body");
  if (!apps.length) {
    body.innerHTML = `<tr><td colspan="6" class="px-5 py-10 text-center text-body-md text-on-surface-variant">
      No applications yet. Candidates apply from the public careers page — share your job links to get started.</td></tr>`;
    return;
  }
  body.innerHTML = apps
    .map(
      (app) => `<tr class="hover:bg-surface-container-low">
        <td class="px-5 py-3.5">
          <a href="/candidates/${app.id}" class="font-semibold text-on-surface hover:text-primary hover:underline">${escapeHtml(app.candidate_name)}</a>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(app.email)}</p>
        </td>
        <td class="px-5 py-3.5 text-on-surface-variant">${escapeHtml(app.job_title)}</td>
        <td class="px-5 py-3.5">${scoreBadge(app.match_score)}</td>
        <td class="px-5 py-3.5">${statusBadge(app.status)}</td>
        <td class="px-5 py-3.5 text-on-surface-variant">${formatDate(app.created_at)}</td>
        <td class="px-5 py-3.5 text-right">
          <a href="/candidates/${app.id}" class="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm font-semibold text-on-surface hover:bg-primary hover:text-on-primary">View</a>
        </td>
      </tr>`
    )
    .join("");
}

function renderRecentJobs(jobs) {
  const list = qs("#recent-jobs-list");
  if (!jobs.length) {
    list.innerHTML = `<li class="px-5 py-10 text-center text-body-md text-on-surface-variant">No jobs created yet.</li>`;
    return;
  }
  list.innerHTML = jobs
    .map(
      (job) => `<li class="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-container-low">
        <div class="min-w-0 flex-1">
          <a href="/jobs/${job.id}" class="block truncate text-body-md font-semibold text-on-surface hover:text-primary hover:underline">${escapeHtml(job.title)}</a>
          <p class="text-body-sm text-on-surface-variant">${escapeHtml(job.department)} · ${escapeHtml(job.location)}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          ${statusBadge(job.status)}
          <span class="text-label-sm text-on-surface-variant">${job.applicant_count} applicant${job.applicant_count === 1 ? "" : "s"}</span>
        </div>
        <a href="/jobs/${job.id}" class="shrink-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm font-semibold text-on-surface hover:bg-primary hover:text-on-primary">View</a>
      </li>`
    )
    .join("");
}

async function load() {
  try {
    const [summaryBody, trendBody, distBody] = await Promise.all([
      api.get("/dashboard/summary"),
      api.get("/dashboard/trends"),
      api.get("/analytics/status-distribution"),
    ]);
    const summary = summaryBody.data;

    renderMetrics(summary);
    renderQuickActions(summary.total_jobs > 0);
    renderRecentApps(summary.recent_applications || []);
    renderRecentJobs(summary.recent_jobs || []);

    lineChart(qs("#trend-chart"), trendBody.data.series);
    donutChart(
      qs("#status-chart"),
      (distBody.data || []).map((item) => ({ label: item.status, count: item.count }))
    );

    qs("#getting-started").classList.toggle("hidden", summary.total_jobs > 0);
  } catch (err) {
    toastError(err);
    qs("#metrics").innerHTML = `<div class="sm:col-span-2 xl:col-span-4">${emptyState({
      title: "Could not load dashboard data",
      description: err.message,
    })}</div>`;
  }
}

qs("#refresh-btn").addEventListener("click", load);
load();
