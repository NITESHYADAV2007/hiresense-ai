/* Shared UI helpers: toasts, confirmations, badges, states, pagination, formatting. */

import { icon } from "./icons.js";

/* ---------------- escaping & formatting ---------------- */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function longDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many || one + "s"}`;
}

/** Deterministic colourful avatar chip for people. */
export function avatarChip(name, { size = "h-9 w-9", text = "text-label-md" } = {}) {
  const palette = [
    "bg-primary-fixed text-on-primary-fixed-variant",
    "bg-secondary-fixed text-on-secondary-fixed",
    "bg-tertiary-fixed text-on-tertiary-fixed",
    "bg-error-container text-on-error-container",
    "bg-primary-container text-on-primary",
    "bg-secondary-container text-white",
  ];
  const initials = String(name || "?")
    .split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = palette[hash % palette.length];
  return `<span class="inline-flex shrink-0 items-center justify-center rounded-full ${size} ${text} font-bold" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

/* ---------------- status & score presentation ---------------- */

export const STATUS_STYLES = {
  Applied: "bg-info-soft text-info",
  "Under Review": "bg-warning-soft text-warning",
  Shortlisted: "bg-primary-fixed text-on-primary-fixed-variant",
  Interview: "bg-interview-soft text-interview",
  Hired: "bg-success-soft text-success",
  Rejected: "bg-danger-soft text-danger",
  open: "bg-success-soft text-success",
  closed: "bg-danger-soft text-danger",
  archived: "bg-surface-container-high text-on-surface-variant",
};

const STATUS_ICONS = {
  Applied: "FileText",
  "Under Review": "Eye",
  Shortlisted: "Star",
  Interview: "CalendarMonth",
  Hired: "CheckCircle",
  Rejected: "X",
  open: "CheckCircle",
  closed: "X",
  archived: "FolderOpen",
};

/** Status badge: icon PLUS colour AND text, so colour is never the only cue. */
export function statusBadge(status) {
  const style = STATUS_STYLES[status] || "bg-surface-container-high text-on-surface-variant";
  const ic = STATUS_ICONS[status] || "Info";
  return `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-md ${style}">
    ${icon(ic, { className: "text-[14px]" })}${escapeHtml(status)}
  </span>`;
}

/** Match score ring — circular progress with the percentage in the middle. */
export function scoreRing(score, { size = 56, stroke = 5 } = {}) {
  if (score === null || score === undefined) {
    return `<span class="text-body-sm text-on-surface-variant">Not scored</span>`;
  }
  const value = Math.max(0, Math.min(100, Math.round(Number(score))));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  let color = "#ba1a1a";
  if (value >= 70) color = "#027a48";
  else if (value >= 45) color = "#b54708";
  return `<span class="relative inline-flex items-center justify-center" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" class="score-ring" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" style="stroke: var(--ring-track)" stroke-width="${stroke}"></circle>
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
              stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
    </svg>
    <span class="absolute text-label-md font-bold text-on-surface">${value}%</span>
  </span>`;
}

/** Match score pill with a label that also states the number in words. */
export function scoreBadge(score) {
  if (score === null || score === undefined) {
    return `<span class="text-body-sm text-on-surface-variant">Not scored</span>`;
  }
  const value = Math.round(Number(score));
  let tone = "bg-danger-soft text-danger";
  let label = "Low";
  let ic = "TrendingDown";
  if (value >= 70) {
    tone = "bg-success-soft text-success";
    label = "Strong";
    ic = "TrendingUp";
  } else if (value >= 45) {
    tone = "bg-warning-soft text-warning";
    label = "Moderate";
    ic = "TrendingUp";
  }
  return `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-md ${tone}">
    ${icon(ic, { className: "text-[14px]" })}${value}% <span class="hidden sm:inline font-medium opacity-80">${label}</span>
  </span>`;
}

/* ---------------- toasts ---------------- */

function toastContainer() {
  let el = document.getElementById("toast-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-root";
    el.className = "fixed bottom-5 right-5 z-[80] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, type = "success", ttl = 4000) {
  const tones = {
    success: "border-success/25 bg-success-soft text-success",
    error: "border-error/30 bg-error-container text-on-error-container",
    info: "border-info/25 bg-info-soft text-info",
    warning: "border-warning/25 bg-warning-soft text-warning",
  };
  const icons = {
    success: "CheckCircle",
    error: "AlertTriangle",
    info: "Info",
    warning: "AlertTriangle",
  };
  const el = document.createElement("div");
  el.className = `toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-body-md font-medium shadow-pop ${tones[type] || tones.info}`;
  el.innerHTML = `${icon(icons[type] || "Info", { className: "mt-0.5 shrink-0 text-[20px]" })}<span class="flex-1">${escapeHtml(message)}</span>`;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.className = "opacity-60 hover:opacity-100";
  close.innerHTML = icon("X", { className: "text-[18px]" });
  close.addEventListener("click", () => el.remove());
  el.appendChild(close);
  toastContainer().appendChild(el);
  if (ttl > 0) setTimeout(() => el.remove(), ttl);
}

export function toastError(err) {
  const message = err && err.message ? err.message : "Something went wrong.";
  toast(message, "error", 6000);
}

/* ---------------- confirmation dialog ---------------- */

export function confirmDialog({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4";
    wrap.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="cd-title"
           class="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-pop">
        <div class="flex h-11 w-11 items-center justify-center rounded-full ${
          danger ? "bg-error-container text-on-error-container" : "bg-primary-fixed text-on-primary-fixed-variant"
        }">${icon(danger ? "AlertTriangle" : "Info", { className: "text-[22px]" })}</div>
        <h2 id="cd-title" class="mt-3 font-headline-sm text-headline-md text-on-surface">${escapeHtml(title)}</h2>
        <p class="mt-2 text-body-md leading-6 text-on-surface-variant">${escapeHtml(message)}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button type="button" data-cancel
                  class="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-semibold text-on-surface hover:bg-surface-container-low">
            ${escapeHtml(cancelLabel)}
          </button>
          <button type="button" data-confirm
                    class="rounded-lg px-4 py-2 text-body-md font-semibold text-on-primary shadow-sm ${
                      danger ? "bg-error hover:opacity-90" : "bg-primary-container hover:bg-primary"
                    }">
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>`;

    const done = (value) => {
      document.removeEventListener("keydown", onKey);
      wrap.remove();
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === "Escape") done(false);
      if (event.key === "Tab") {
        const focusables = wrap.querySelectorAll("button");
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    wrap.querySelector("[data-cancel]").addEventListener("click", () => done(false));
    wrap.querySelector("[data-confirm]").addEventListener("click", () => done(true));
    wrap.addEventListener("mousedown", (event) => {
      if (event.target === wrap) done(false);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    wrap.querySelector("[data-confirm]").focus();
  });
}

/* ---------------- loading / empty / error states ---------------- */

export function skeletonRows(count = 5, cols = 5) {
  let rows = "";
  for (let r = 0; r < count; r += 1) {
    rows += `<tr class="border-b border-outline-variant last:border-0">`;
    for (let c = 0; c < cols; c += 1) {
      rows += `<td class="px-4 py-3.5"><div class="hs h-4 w-full max-w-[140px]"></div></td>`;
    }
    rows += `</tr>`;
  }
  return rows;
}

export function skeletonCards(count = 3) {
  let html = "";
  for (let i = 0; i < count; i += 1) {
    html += `<div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
      <div class="hs h-4 w-24"></div>
      <div class="hs mt-4 h-7 w-32"></div>
      <div class="hs mt-3 h-3 w-40"></div>
    </div>`;
  }
  return html;
}

export function emptyState({ title, description, action = "", icon: iconName = "Inbox" } = {}) {
  return `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">
      ${icon(iconName, { className: "text-[28px]" })}
    </div>
    <h3 class="mt-4 font-headline-sm text-headline-sm text-on-surface">${escapeHtml(title)}</h3>
    <p class="mt-1.5 max-w-md text-body-md leading-6 text-on-surface-variant">${escapeHtml(description || "")}</p>
    ${action ? `<div class="mt-5">${action}</div>` : ""}
  </div>`;
}

export function errorState(message, retrySelector = null) {
  return `<div class="flex flex-col items-center justify-center rounded-xl border border-error/30 bg-error-container/50 px-6 py-12 text-center">
    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-on-error-container" aria-hidden="true">
      ${icon("AlertTriangle", { className: "text-[24px]" })}
    </div>
    <h3 class="mt-4 font-headline-sm text-headline-sm text-on-error-container">Something went wrong</h3>
    <p class="mt-1.5 max-w-md text-body-md leading-6 text-on-error-container/80">${escapeHtml(message)}</p>
    ${retrySelector ? `<button type="button" data-retry="${retrySelector}" class="mt-5 rounded-lg bg-error px-4 py-2 text-body-md font-semibold text-on-primary hover:opacity-90">Try again</button>` : ""}
  </div>`;
}

/* ---------------- pagination ---------------- */

export function paginationMarkup({ page, total_pages: totalPages, total }, attrs = 'data-action="page"') {
  if (!totalPages || totalPages <= 1) return "";
  const buttons = [];
  const push = (label, target, opts = {}) => {
    const disabled = opts.disabled ? "disabled" : "";
    const active = opts.active
      ? "bg-primary-container text-on-primary border-primary-container"
      : "bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container-low";
    buttons.push(
      `<button type="button" ${attrs}="${target}" ${disabled}
        class="min-w-9 rounded-lg border px-3 py-1.5 text-body-md font-semibold ${active} disabled:cursor-not-allowed disabled:opacity-40"
        ${opts.active ? 'aria-current="page"' : ""}>${label}</button>`
    );
  };

  push(icon("ChevronLeft", { className: "text-[18px]" }), page - 1, { disabled: page <= 1 });
  const window = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) window.push(i);
  }
  let previous = 0;
  window.forEach((i) => {
    if (previous && i - previous > 1) {
      buttons.push(`<span class="px-1 text-body-md text-on-surface-variant">…</span>`);
    }
    push(i, i, { active: i === page });
    previous = i;
  });
  push(icon("ChevronRight", { className: "text-[18px]" }), page + 1, { disabled: page >= totalPages });

  return `<nav class="flex flex-wrap items-center justify-between gap-3 pt-4" aria-label="Pagination">
    <p class="text-body-md text-on-surface-variant">Page ${page} of ${totalPages} · ${total} total</p>
    <div class="flex items-center gap-1.5">${buttons.join("")}</div>
  </nav>`;
}

/* ---------------- misc ---------------- */

export function fieldError(input, message) {
  const holder = input.closest("[data-field]");
  if (!holder) return;
  holder.querySelector("[data-error]")?.remove();
  input.classList.add("border-error");
  input.setAttribute("aria-invalid", "true");
  const el = document.createElement("p");
  el.setAttribute("data-error", "");
  el.className = "mt-1.5 flex items-center gap-1 text-body-sm font-medium text-error";
  el.innerHTML = `${icon("AlertTriangle", { className: "text-[14px]" })}${escapeHtml(message)}`;
  holder.appendChild(el);
}

export function clearFieldError(input) {
  const holder = input.closest("[data-field]");
  if (!holder) return;
  holder.querySelector("[data-error]")?.remove();
  input.classList.remove("border-error");
  input.removeAttribute("aria-invalid");
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Disable a button during async work and restore it afterwards. */
export async function withBusy(button, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add("opacity-70", "cursor-wait");
  button.innerHTML = `<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span><span class="ml-2">Please wait…</span>`;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove("opacity-70", "cursor-wait");
    button.innerHTML = original;
  }
}

/** Standard page header used on recruiter pages: title, subtitle, actions. */
export function pageHeader({ title, subtitle = "", actions = "" }) {
  return `<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="font-headline-lg text-headline-lg text-on-surface">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="mt-1 text-body-md text-on-surface-variant">${subtitle}</p>` : ""}
    </div>
    ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ""}
  </div>`;
}

/** Metric card used on dashboard / analytics. */
export function metricCard({ label, value, iconName, tone = "primary", caption = "", delta = "" }) {
  const tones = {
    primary: "bg-primary-fixed text-on-primary-fixed-variant",
    secondary: "bg-secondary-fixed text-on-secondary-fixed",
    tertiary: "bg-tertiary-fixed text-on-tertiary-fixed",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    error: "bg-error-container text-on-error-container",
  };
  return `<div class="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-body-md text-on-surface-variant">${escapeHtml(label)}</p>
      <span class="flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone] || tones.primary}">
        ${icon(iconName, { className: "text-[20px]" })}
      </span>
    </div>
    <p class="mt-3 font-headline-lg text-headline-lg text-on-surface">${escapeHtml(String(value))}</p>
    ${delta ? `<span class="mt-2 inline-flex items-center gap-1 text-body-sm font-semibold text-success">${icon("TrendingUp", { className: "text-[16px]" })}${escapeHtml(delta)}</span>` : ""}
    ${caption ? `<p class="mt-1 text-body-sm text-on-surface-variant">${escapeHtml(caption)}</p>` : ""}
  </div>`;
}
