/* Public job detail: load one open job and link to the application form. */

import { api } from "/js/api.js";
import { mountPublicNav, mountPublicFooter } from "/js/layout.js";
import { escapeHtml, statusBadge } from "/js/ui.js";
import { icon } from "/js/icons.js";

mountPublicNav({ active: "careers" });
mountPublicFooter();

const jobId = window.location.pathname.split("/").pop();

async function load() {
  try {
    const body = await api.get(`/public/jobs/${encodeURIComponent(jobId)}`);
    const job = body.data;

    document.title = `${job.title} · HireSense AI`;
    qs("#job-status").innerHTML = statusBadge(job.status);
    qs("#job-title").textContent = job.title;

    const meta = [
      ["Building", job.department],
      ["MapPin", job.location],
      ["Clock", job.employment_type],
      ["Star", job.experience_level],
    ];
    qs("#job-meta").innerHTML = meta
      .map(
        ([name, value]) => `<div class="flex items-center gap-2">
          ${icon(name, { className: "text-[18px] text-primary" })}<span>${escapeHtml(value)}</span></div>`
      )
      .join("");

    qs("#job-skills").innerHTML = (job.required_skills || [])
      .map(
        (skill) =>
          `<span class="rounded-full bg-primary-fixed px-3 py-1 text-body-sm font-semibold text-on-primary-fixed-variant">${escapeHtml(skill)}</span>`
      )
      .join("");

    qs("#job-description").textContent = job.description || "";

    qs("#skills-list").innerHTML = (job.required_skills || [])
      .map(
        (skill) => `<li class="flex items-start gap-2.5 text-body-md text-on-surface-variant">
          <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">${icon("Check", { className: "text-[14px]" })}</span>
          ${escapeHtml(skill)}</li>`
      )
      .join("") || `<li class="text-body-md text-on-surface-variant">No specific skills listed for this role.</li>`;

    const applyLink = qs("#apply-link");
    if (job.status !== "open") {
      applyLink.classList.add("hidden");
      qs("#closed-notice").classList.remove("hidden");
    } else {
      applyLink.href = `/apply/${job.id}`;
    }

    qs("#loading").classList.add("hidden");
    qs("#job-card").classList.remove("hidden");
  } catch (err) {
    qs("#loading").classList.add("hidden");
    if (err.status === 404) {
      qs("#not-found").classList.remove("hidden");
    } else {
      qs("#not-found").classList.remove("hidden");
      qs("#not-found").querySelector("h1").textContent = "Could not load this job";
      qs("#not-found").querySelector("p").textContent = err.message;
    }
  }
}

function qs(selector) {
  return document.querySelector(selector);
}

qs("#copy-link")?.addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    event.target.textContent = "Link copied!";
    setTimeout(() => {
      event.target.textContent = "Copy link";
    }, 2000);
  } catch {
    event.target.textContent = "Copy failed";
  }
});

load();
