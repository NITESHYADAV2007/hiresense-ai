/* Command palette (Ctrl+K): lightning-fast navigation, quick actions, and
 * live search across jobs and candidates. */
import { api } from "./api.js";
import { icon } from "./icons.js";
import { escapeHtml, avatarChip } from "./ui.js";
import { logout } from "./auth.js";

const ACTIONS = [
  { id: "nav-dashboard", section: "Navigate", label: "Go to Overview", sub: "/dashboard", iconName: "LayoutDashboard", href: "/dashboard" },
  { id: "nav-jobs", section: "Navigate", label: "Go to Jobs", sub: "/jobs", iconName: "BriefcaseBusiness", href: "/jobs" },
  { id: "nav-candidates", section: "Navigate", label: "Go to Candidates", sub: "/candidates", iconName: "Users", href: "/candidates" },
  { id: "nav-pipeline", section: "Navigate", label: "Go to Pipeline", sub: "/pipeline", iconName: "GitBranch", href: "/pipeline" },
  { id: "nav-analytics", section: "Navigate", label: "Go to Analytics", sub: "/analytics", iconName: "ChartNoAxesCombined", href: "/analytics" },
  { id: "nav-settings", section: "Navigate", label: "Go to Settings", sub: "/settings", iconName: "Settings", href: "/settings" },
  { id: "nav-public", section: "Navigate", label: "Browse the public careers site", sub: "/careers", iconName: "Public", href: "/careers" },
  { id: "action-new-job", section: "Create", label: "Create a new job", sub: "Open the job form", iconName: "Plus", href: "/jobs/new" },
  { id: "action-theme", section: "Actions", label: "Toggle dark mode", sub: "Switch between light and dark", iconName: "DarkMode", run: () => window.HireSenseTheme && window.HireSenseTheme.toggle() },
  { id: "action-logout", section: "Actions", label: "Sign out", sub: "End your session", iconName: "LogOut", run: () => logout() },
];

let overlay = null;
let input = null;
let listEl = null;
let items = [];
let activeIndex = 0;
let debounceTimer = null;
let requestSeq = 0;
let searchResults = { jobs: [], candidates: [] };
let recentJobs = [];

function matches(action, query) {
  const haystack = `${action.label} ${action.sub || ""} ${action.section}`.toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

function paletteItems(query) {
  const q = query.trim().toLowerCase();
  const out = [];

  const actions = q ? ACTIONS.filter((a) => matches(a, q)) : ACTIONS;
  for (const action of actions) {
    out.push({ ...action, kind: "action" });
  }

  if (!q && recentJobs.length) {
    for (const job of recentJobs) {
      out.push({
        id: `recent-job-${job.id}`,
        section: "Recent jobs",
        label: job.title,
        sub: `${job.department} · ${job.location}`,
        iconName: "BriefcaseBusiness",
        href: `/jobs/${job.id}`,
        kind: "job",
      });
    }
  }

  if (q) {
    for (const job of searchResults.jobs) {
      out.push({
        id: `job-${job.id}`,
        section: "Jobs",
        label: job.title,
        sub: `${job.department} · ${job.location}`,
        iconName: "BriefcaseBusiness",
        href: `/jobs/${job.id}`,
        kind: "job",
      });
    }
    for (const app of searchResults.candidates) {
      out.push({
        id: `candidate-${app.id}`,
        section: "Candidates",
        label: app.candidate_name,
        sub: `${app.job_title} · ${app.status}`,
        avatar: app.candidate_name,
        href: `/candidates/${app.id}`,
        kind: "candidate",
      });
    }
  }

  return out;
}

function render() {
  const query = input ? input.value : "";
  items = paletteItems(query);

  if (!items.length) {
    listEl.innerHTML = `<div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
      ${icon("SearchOff", { className: "text-[28px] text-on-surface-variant" })}
      <p class="text-body-md text-on-surface-variant">No results for “${escapeHtml(query)}”</p>
      <p class="text-body-sm text-on-surface-variant/70">Try a job title, candidate name, or email.</p>
    </div>`;
    return;
  }

  if (activeIndex >= items.length) activeIndex = 0;

  let html = "";
  let lastSection = "";
  items.forEach((item, index) => {
    if (item.section !== lastSection) {
      html += `<p class="px-3 pt-3 pb-1 text-label-sm uppercase tracking-wider text-on-surface-variant/70">${escapeHtml(item.section)}</p>`;
      lastSection = item.section;
    }
    const active = index === activeIndex;
    const lead = item.avatar
      ? avatarChip(item.avatar, { size: "h-8 w-8", text: "text-label-sm" })
      : `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary-container text-on-primary" : "bg-surface-container-low text-on-surface-variant"}">
           ${icon(item.iconName || "Search", { className: "text-[18px]" })}
         </span>`;
    html += `<button type="button" data-index="${index}" role="option" aria-selected="${active}"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
          active ? "bg-surface-container-low" : "hover:bg-surface-container-low/60"
        }">
      ${lead}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-body-md font-semibold ${active ? "text-on-surface" : "text-on-surface/90"}">${escapeHtml(item.label)}</span>
        ${item.sub ? `<span class="block truncate text-body-sm text-on-surface-variant">${escapeHtml(item.sub)}</span>` : ""}
      </span>
      ${active ? icon("Return", { className: "text-[16px] text-on-surface-variant" }) : ""}
    </button>`;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll("[data-index]").forEach((el) => {
    el.addEventListener("mousemove", () => {
      const index = Number(el.dataset.index);
      if (index !== activeIndex) {
        activeIndex = index;
        updateActive();
      }
    });
    el.addEventListener("click", () => runItem(items[Number(el.dataset.index)]));
  });
  updateActive();
}

function updateActive() {
  listEl.querySelectorAll("[data-index]").forEach((el) => {
    const index = Number(el.dataset.index);
    const active = index === activeIndex;
    el.setAttribute("aria-selected", String(active));
    el.classList.toggle("bg-surface-container-low", active);
    if (active) el.scrollIntoView({ block: "nearest" });
  });
}

function runItem(item) {
  if (!item) return;
  close();
  if (item.run) {
    item.run();
  } else if (item.href) {
    window.location.href = item.href;
  }
}

async function fetchResults(query) {
  const seq = ++requestSeq;
  if (!query.trim()) {
    searchResults = { jobs: [], candidates: [] };
    render();
    return;
  }
  try {
    const [jobs, candidates] = await Promise.all([
      api.get(`/jobs?search=${encodeURIComponent(query)}&per_page=6`),
      api.get(`/applications?search=${encodeURIComponent(query)}&per_page=6`),
    ]);
    if (seq !== requestSeq) return; // a newer keystroke superseded this request
    searchResults = { jobs: jobs?.data || [], candidates: candidates?.data || [] };
    render();
  } catch {
    /* palette search is best-effort */
  }
}

function onKeydown(event) {
  if (!overlay) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    if (items.length) {
      activeIndex = (activeIndex + 1) % items.length;
      updateActive();
    }
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (items.length) {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive();
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    runItem(items[activeIndex]);
  } else if (event.key === "Tab") {
    event.preventDefault(); // keep focus in the input while the palette is open
  }
}

export function openCommandPalette() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "modal-backdrop fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh]";
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="Command palette"
         class="w-full max-w-xl overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-pop">
      <div class="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
        ${icon("Search", { className: "text-[20px] text-on-surface-variant" })}
        <input data-cmdk-input type="text" autocomplete="off" spellcheck="false"
               placeholder="Search jobs, candidates, or run a command…"
               class="flex-1 bg-transparent text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
               aria-label="Search commands, jobs and candidates" />
        <kbd class="rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-label-sm text-on-surface-variant">esc</kbd>
      </div>
      <div data-cmdk-list class="max-h-[52vh] overflow-y-auto p-2 thin-scroll" role="listbox" aria-label="Results"></div>
      <div class="flex items-center gap-4 border-t border-outline-variant px-4 py-2 text-label-sm text-on-surface-variant">
        <span class="flex items-center gap-1">${icon("ArrowUp", { className: "text-[14px]" })}${icon("ArrowDown", { className: "text-[14px]" })} navigate</span>
        <span class="flex items-center gap-1">${icon("Return", { className: "text-[14px]" })} select</span>
        <span class="ml-auto hidden sm:block">Searches jobs and candidates</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  input = overlay.querySelector("[data-cmdk-input]");
  listEl = overlay.querySelector("[data-cmdk-list]");
  activeIndex = 0;
  render();
  input.focus();

  input.addEventListener("input", () => {
    render();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchResults(input.value), 160);
  });

  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown, true);

  // Recent jobs make the empty state useful immediately.
  api
    .get("/jobs?limit=5")
    .then((body) => {
      recentJobs = body?.data || [];
      if (overlay && !input.value.trim()) render();
    })
    .catch(() => {
      /* best-effort */
    });
}

export function close() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  input = null;
  listEl = null;
  items = [];
  activeIndex = 0;
  searchResults = { jobs: [], candidates: [] };
  clearTimeout(debounceTimer);
  requestSeq++;
  document.removeEventListener("keydown", onKeydown, true);
}

export function isCommandPaletteOpen() {
  return overlay !== null;
}
