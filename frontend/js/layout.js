/* Page shells: public header/footer and the recruiter sidebar + topbar (M3). */

import { icon } from "./icons.js";
import { escapeHtml, qs, qsa, formatDate, avatarChip, scoreBadge } from "./ui.js";
import { getUser, logout } from "./auth.js";
import { api } from "./api.js";
import { openCommandPalette } from "./command-palette.js";

const RECRUITER_NAV = [
  { label: "Overview", path: "/dashboard", icon: "LayoutDashboard" },
  { label: "Jobs", path: "/jobs", icon: "BriefcaseBusiness", countKey: "jobs" },
  { label: "Candidates", path: "/candidates", icon: "Users", countKey: "candidates" },
  { label: "Pipeline", path: "/pipeline", icon: "GitBranch" },
  { label: "Analytics", path: "/analytics", icon: "ChartNoAxesCombined" },
];

function isActive(path, current) {
  if (path === "/dashboard") return current === "/dashboard";
  return current === path || current.startsWith(path + "/");
}

/* ---------------- recruiter shell ---------------- */

export function mountRecruiterLayout({ active = "", title = "" } = {}) {
  const current = window.location.pathname;
  const user = getUser();
  const initials = (user?.name || "R")
    .split(/\s+/).map((p) => p[0]).join("")
    .slice(0, 2).toUpperCase();

  const navHtml = RECRUITER_NAV.map((item) => {
    const isActiveNav = isActive(item.path, active) || isActive(item.path, current);
    return `<li>
      <a href="${item.path}"
         class="nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold transition
                ${isActiveNav
                  ? "bg-surface-container-low text-primary border-r-4 border-primary"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}"
         ${isActiveNav ? 'aria-current="page"' : ""}>
        ${icon(item.icon, { className: "text-[20px]" })}
        <span class="flex-1">${item.label}</span>
        ${item.countKey ? `<span data-nav-count="${item.countKey}" class="hidden"></span>` : ""}
      </a></li>`;
  }).join("");

  const shell = document.createElement("div");
  shell.className = "min-h-screen bg-background";
  shell.innerHTML = `
    <!-- Mobile drawer backdrop -->
    <div data-drawer-backdrop class="fixed inset-0 z-40 hidden bg-black/40 lg:hidden"></div>

    <!-- Sidebar -->
    <aside data-sidebar
           class="fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full flex-col border-r border-outline-variant bg-surface-container-lowest transition-transform lg:translate-x-0">
      <div class="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container font-heading text-sm font-extrabold text-on-primary">HS</span>
        <div class="leading-tight">
          <p class="font-headline-sm text-headline-sm text-on-surface">HireSense AI</p>
          <p class="text-body-sm text-on-surface-variant">Recruiter Workspace</p>
        </div>
        <button type="button" data-close-drawer class="ml-auto rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
                aria-label="Close navigation">${icon("X", { className: "text-[20px]" })}</button>
      </div>

      <div class="px-3 pt-2">
        <a href="/jobs/new"
           class="flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-body-md font-semibold text-on-primary shadow-sm transition hover:bg-primary">
          ${icon("Plus", { className: "text-[18px]" })} Create Job
        </a>
      </div>

      <nav class="mt-3 flex-1 overflow-y-auto px-3" aria-label="Recruiter navigation">
        <p class="px-3 pb-2 text-label-sm uppercase tracking-wider text-on-surface-variant/70">Recruitment</p>
        <ul class="space-y-1">${navHtml}</ul>

        <div class="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <div class="flex items-center gap-2 text-primary">
            ${icon("Shield", { className: "text-[18px]" })}
            <p class="text-label-md font-semibold">Human review first</p>
          </div>
          <p class="mt-1.5 text-body-sm text-on-surface-variant">
            Match scores support decisions — they never auto-reject anyone.
          </p>
        </div>
      </nav>

      <div class="border-t border-outline-variant p-3">
        <a href="/settings"
           class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">
          ${icon("Settings", { className: "text-[20px]" })} Settings
        </a>
        <a href="/" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">
          ${icon("Home", { className: "text-[20px]" })} Public site
        </a>
        <button type="button" data-logout
                class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-body-md font-semibold text-error hover:bg-error-container/40">
          ${icon("LogOut", { className: "text-[20px]" })} Sign out
        </button>
      </div>
    </aside>

    <!-- Main column -->
    <div class="lg:pl-60">
      <!-- Topbar -->
      <header class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest/95 px-4 backdrop-blur sm:px-6">
        <button type="button" data-open-drawer class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
                aria-label="Open navigation">${icon("Menu", { className: "text-[22px]" })}</button>

        <h1 data-page-title class="hidden truncate font-headline-sm text-headline-md text-on-surface sm:block">
          ${escapeHtml(title || document.title.split("·")[0].trim())}
        </h1>

        <div class="ml-auto flex items-center gap-2">
          <!-- Search opens the command palette (Ctrl+K) -->
          <button type="button" data-open-palette
                  class="relative hidden w-72 items-center rounded-lg border border-outline-variant bg-surface-container-low py-2 pl-10 pr-14 text-left text-body-md text-on-surface-variant transition hover:border-primary/40 hover:bg-surface-container-lowest md:flex"
                  aria-label="Search jobs, candidates, and commands">
            ${icon("Search", { className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" })}
            <span class="truncate">Search jobs, candidates…</span>
            <kbd class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 text-label-sm">Ctrl K</kbd>
          </button>

          <button type="button" data-open-palette
                  class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low md:hidden"
                  aria-label="Search">${icon("Search", { className: "text-[22px]" })}</button>

          <button type="button" data-theme-toggle
                  class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
                  aria-label="Toggle dark mode" title="Toggle dark mode">${icon("DarkMode", { className: "text-[22px]" })}</button>

          <!-- Notifications -->
          <div class="relative" data-notifications-menu>
            <button type="button" data-notifications
                    class="relative rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
                    aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
              ${icon("Notifications", { className: "text-[22px]" })}
              <span data-notif-dot class="absolute right-1.5 top-1.5 hidden h-2 w-2 rounded-full bg-error" aria-hidden="true"></span>
            </button>
            <div data-notif-panel class="absolute right-0 z-40 mt-2 hidden w-80 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-pop sm:w-96" role="menu">
              <div class="flex items-center justify-between px-2.5 py-2">
                <p class="text-label-lg font-semibold text-on-surface">Recent activity</p>
                <span class="rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant">Latest first</span>
              </div>
              <div data-notif-list class="max-h-80 overflow-y-auto thin-scroll">
                <p class="px-3 py-4 text-body-sm text-on-surface-variant">Loading…</p>
              </div>
              <a href="/candidates" class="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">
                View all candidates ${icon("ArrowRight", { className: "text-[16px]" })}
              </a>
            </div>
          </div>

          <!-- User menu -->
          <div class="relative" data-user-menu>
            <button type="button" data-user-toggle
                    class="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-md font-semibold text-on-surface hover:bg-surface-container-low"
                    aria-haspopup="menu" aria-expanded="false">
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-fixed text-label-md font-bold text-on-primary-fixed-variant" data-user-initials>
                ${initials}
              </span>
              <span class="hidden max-w-[140px] truncate sm:block" data-user-name>${escapeHtml(user?.name || "Recruiter")}</span>
              ${icon("ChevronDown", { className: "text-[18px] text-on-surface-variant" })}
            </button>
            <div data-user-panel class="absolute right-0 mt-2 hidden w-60 rounded-xl border border-outline-variant bg-surface-container-lowest p-1.5 shadow-pop" role="menu">
              <div class="border-b border-outline-variant px-3 py-2.5">
                <p class="truncate text-body-md font-semibold text-on-surface" data-user-panel-name>${escapeHtml(user?.name || "")}</p>
                <p class="truncate text-body-sm text-on-surface-variant" data-user-panel-email>${escapeHtml(user?.email || "")}</p>
              </div>
              <a href="/settings" role="menuitem" class="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-md font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">
                ${icon("Settings", { className: "text-[18px]" })} Account settings
              </a>
              <button type="button" data-logout role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-body-md font-medium text-error hover:bg-error-container/40">
                ${icon("LogOut", { className: "text-[18px]" })} Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main id="app-main" class="mx-auto w-full max-w-content space-y-6 p-4 sm:p-6 lg:p-8"></main>
    </div>`;

  document.body.insertBefore(shell, document.body.firstChild);
  const main = qs("#app-main", shell);
  const pageContent = qs("[data-page-content]");
  if (pageContent) main.appendChild(pageContent);

  // Drawer controls
  const sidebar = qs("[data-sidebar]", shell);
  const backdrop = qs("[data-drawer-backdrop]", shell);
  const openDrawer = () => {
    sidebar.classList.remove("-translate-x-full");
    backdrop.classList.remove("hidden");
  };
  const closeDrawer = () => {
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.add("hidden");
  };
  qs("[data-open-drawer]", shell)?.addEventListener("click", openDrawer);
  qs("[data-close-drawer]", shell)?.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  // User menu
  const toggle = qs("[data-user-toggle]", shell);
  const panel = qs("[data-user-panel]", shell);
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(!open));
  });
  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) {
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
      closeDrawer();
    }
    // Ctrl/Cmd + K opens the command palette.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
    }
  });

  // Command palette triggers (topbar search button, mobile search button).
  qsa("[data-open-palette]", shell).forEach((btn) =>
    btn.addEventListener("click", () => openCommandPalette())
  );

  // Theme toggle: flip light/dark and keep the icon in sync.
  const themeBtn = qs("[data-theme-toggle]", shell);
  const syncThemeIcon = () => {
    if (!themeBtn) return;
    const dark = window.HireSenseTheme?.resolved() === "dark";
    themeBtn.innerHTML = icon(dark ? "LightMode" : "DarkMode", { className: "text-[22px]" });
    themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  };
  themeBtn?.addEventListener("click", () => {
    window.HireSenseTheme?.toggle();
    syncThemeIcon();
  });
  document.addEventListener("themechange", syncThemeIcon);
  syncThemeIcon();

  // Notifications: recent activity feed from the dashboard summary.
  const notifButton = qs("[data-notifications]", shell);
  const notifPanel = qs("[data-notif-panel]", shell);
  const notifList = qs("[data-notif-list]", shell);
  let notifLoaded = false;

  const loadNotifications = async () => {
    if (!notifList) return;
    try {
      const body = await api.get("/dashboard/summary");
      const recent = body?.data?.recent_applications || [];
      if (!recent.length) {
        notifList.innerHTML = `<p class="px-3 py-6 text-center text-body-sm text-on-surface-variant">No applications yet. Share your careers page to start receiving candidates.</p>`;
        return;
      }
      notifList.innerHTML = recent
        .map(
          (app) => `
        <a href="/candidates/${app.id}" class="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-surface-container-low" role="menuitem">
          ${avatarChip(app.candidate_name, { size: "h-8 w-8", text: "text-label-sm" })}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-body-md font-semibold text-on-surface">${escapeHtml(app.candidate_name)}</span>
            <span class="block truncate text-body-sm text-on-surface-variant">${escapeHtml(app.job_title)} · applied ${formatDate(app.created_at)}</span>
          </span>
          ${scoreBadge(app.match_score)}
        </a>`
        )
        .join("");
    } catch {
      notifList.innerHTML = `<p class="px-3 py-6 text-center text-body-sm text-on-surface-variant">Could not load activity right now.</p>`;
    }
  };

  notifButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!notifPanel) return;
    const hidden = notifPanel.classList.toggle("hidden");
    notifButton.setAttribute("aria-expanded", String(!hidden));
    if (!hidden && !notifLoaded) {
      notifLoaded = true;
      loadNotifications();
    }
  });

  // Close the notifications panel when clicking elsewhere.
  document.addEventListener("click", (event) => {
    if (!notifPanel || !notifButton) return;
    if (!notifPanel.contains(event.target) && !notifButton.contains(event.target)) {
      notifPanel.classList.add("hidden");
      notifButton.setAttribute("aria-expanded", "false");
    }
  });

  // Show the activity dot when applications exist.
  api
    .get("/applications?per_page=1")
    .then((body) => {
      if ((body?.meta?.total || 0) > 0) {
        qs("[data-notif-dot]", shell)?.classList.remove("hidden");
      }
    })
    .catch(() => {
      /* decorative */
    });

  qsa("[data-logout]", shell).forEach((btn) =>
    btn.addEventListener("click", () => logout())
  );

  // Sidebar nav counts (jobs / candidates) — best effort, silent on failure.
  (async () => {
    try {
      const [jobs, candidates] = await Promise.all([
        api.get("/jobs?per_page=1"),
        api.get("/applications?per_page=1"),
      ]);
      const counts = {
        jobs: jobs?.meta?.total,
        candidates: candidates?.meta?.total,
      };
      Object.entries(counts).forEach(([key, value]) => {
        const el = qs(`[data-nav-count="${key}"]`, shell);
        if (el && value != null) {
          el.textContent = value;
          el.className =
            "min-w-6 rounded-full bg-surface-container-high px-2 py-0.5 text-center text-label-sm text-on-surface-variant";
        }
      });
    } catch {
      /* counts are decorative */
    }
  })();

  return main;
}

/* ---------------- public header & footer ---------------- */

const GITHUB_URL = "https://github.com/niteshyadav2007/hiresense-ai";
const githubMark = `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

export function mountPublicNav({ active = "" } = {}) {
  const host = qs("[data-public-nav]");
  if (!host) return;
  const links = [
    { label: "Home", path: "/", key: "home" },
    { label: "Careers", path: "/careers", key: "careers" },
    { label: "My Profile", path: "/profile", key: "profile" },
    { label: "Features", path: "/#features", key: "features" },
  ];
  host.innerHTML = `
    <header class="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-content items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a href="/" class="flex items-center gap-2.5" aria-label="HireSense AI home">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container font-heading text-sm font-extrabold text-on-primary">HS</span>
          <span class="font-headline-sm text-headline-sm text-on-surface">HireSense AI</span>
        </a>
        <nav class="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
          ${links
            .map(
              (link) => `<a href="${link.path}"
                class="rounded-lg px-3 py-2 text-body-md font-semibold transition ${
                  active && link.key === active
                    ? "bg-surface-container-low text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }">${link.label}</a>`
            )
            .join("")}
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer"
             class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
             aria-label="View source on GitHub" title="View source on GitHub">${githubMark}</a>
          <button type="button" data-public-theme
                  class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
                  aria-label="Toggle dark mode" title="Toggle dark mode">${icon("DarkMode", { className: "text-[22px]" })}</button>
          <a href="/login" class="hidden rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low sm:inline-flex">Sign in</a>
          <a href="/signup" class="rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary shadow-sm hover:bg-primary">Get started</a>
          <button type="button" data-nav-toggle class="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low md:hidden" aria-label="Toggle menu" aria-expanded="false">
            ${icon("Menu", { className: "text-[22px]" })}
          </button>
        </div>
      </div>
      <div data-nav-panel class="hidden border-t border-outline-variant bg-surface-container-lowest px-4 py-3 md:hidden">
        <nav class="flex flex-col gap-1" aria-label="Mobile">
          ${links
            .map(
              (link) => `<a href="${link.path}" class="rounded-lg px-3 py-2.5 text-body-md font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">${link.label}</a>`
            )
            .join("")}
          <a href="/login" class="rounded-lg px-3 py-2.5 text-body-md font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">Sign in</a>
          <a href="/signup" class="rounded-lg bg-primary-container px-3 py-2.5 text-center text-body-md font-semibold text-on-primary">Create account</a>
        </nav>
      </div>
    </header>`;

  const panel = qs("[data-nav-panel]", host);
  const toggle = qs("[data-nav-toggle]", host);
  toggle?.addEventListener("click", () => {
    const hidden = panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(!hidden));
  });

  // Theme toggle for the public header.
  const themeBtn = qs("[data-public-theme]", host);
  if (themeBtn) {
    const syncThemeIcon = () => {
      const dark = window.HireSenseTheme?.resolved() === "dark";
      themeBtn.innerHTML = icon(dark ? "LightMode" : "DarkMode", { className: "text-[22px]" });
      themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    };
    themeBtn.addEventListener("click", () => {
      window.HireSenseTheme?.toggle();
      syncThemeIcon();
    });
    document.addEventListener("themechange", syncThemeIcon);
    syncThemeIcon();
  }
}

export function mountPublicFooter() {
  const host = qs("[data-public-footer]");
  if (!host) return;
  host.innerHTML = `
    <footer class="border-t border-outline-variant bg-surface-container-lowest">
      <div class="mx-auto grid max-w-content gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div class="md:col-span-2">
          <div class="flex items-center gap-2.5">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-container font-heading text-xs font-extrabold text-on-primary">HS</span>
            <span class="font-headline-sm text-headline-sm text-on-surface">HireSense AI</span>
          </div>
          <p class="mt-3 max-w-sm text-body-md leading-6 text-on-surface-variant">
            An AI-assisted recruitment workspace for posting jobs, collecting
            applications, and reviewing resume matches — with human review kept
            firmly in the loop.
          </p>
          <div class="mt-4 flex items-center gap-2 text-body-sm text-on-surface-variant">
            ${icon("Verified", { className: "text-[18px] text-primary" })}
            Open demo · scores are decision support only
          </div>
        </div>
        <div>
          <h2 class="text-label-lg font-semibold text-on-surface">Product</h2>
          <ul class="mt-3 space-y-2 text-body-md text-on-surface-variant">
            <li><a href="/#features" class="hover:text-on-surface">Features</a></li>
            <li><a href="/careers" class="hover:text-on-surface">Open roles</a></li>
            <li><a href="/login" class="hover:text-on-surface">Sign in</a></li>
            <li><a href="/signup" class="hover:text-on-surface">Create account</a></li>
          </ul>
        </div>
        <div>
          <h2 class="text-label-lg font-semibold text-on-surface">Company</h2>
          <ul class="mt-3 space-y-2 text-body-md text-on-surface-variant">
            <li><a href="/#about" class="hover:text-on-surface">About</a></li>
            <li><a href="/careers" class="hover:text-on-surface">Careers</a></li>
            <li><a href="/#privacy" class="hover:text-on-surface">Privacy</a></li>
            <li><a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 hover:text-on-surface">${githubMark} GitHub</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-outline-variant">
        <div class="mx-auto flex max-w-content flex-col gap-2 px-4 py-5 text-body-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© ${new Date().getFullYear()} HireSense AI. All rights reserved.</p>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-1.5 font-semibold text-on-surface hover:text-primary">${githubMark} View source</a>
            <p>Match scores are decision support only — never an automatic rejection.</p>
          </div>
        </div>
      </div>
    </footer>`;
}
