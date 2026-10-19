/* Session handling: load the current recruiter, guard protected pages. */

import { api, setCsrfToken, onUnauthorized } from "./api.js";

let currentUser = null;
let pending = null;

export function getUser() {
  return currentUser;
}

/** Fetch the current session once and cache the result. */
export function loadSession() {
  if (!pending) {
    pending = api
      .get("/auth/me")
      .then((body) => {
        currentUser = body.data;
        setCsrfToken(currentUser.csrf_token);
        return currentUser;
      })
      .catch((err) => {
        if (err.status !== 401) console.warn("Session check failed:", err.message);
        currentUser = null;
        return null;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/**
 * Require a signed-in recruiter. Redirects to /login (remembering the target)
 * when there is no session. Resolves with the recruiter on success.
 */
export async function requireAuth() {
  const user = await loadSession();
  if (user) return user;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
  return new Promise(() => {}); // stop the calling page while redirecting
}

/** Redirect to /dashboard when a signed-in recruiter visits /login. */
export async function redirectIfAuthenticated(target = "/dashboard") {
  const user = await loadSession();
  if (user) {
    window.location.href = target;
    return true;
  }
  return false;
}

export async function login(email, password) {
  const body = await api.post("/auth/login", { email, password });
  currentUser = body.data;
  setCsrfToken(currentUser.csrf_token);
  return currentUser;
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } finally {
    currentUser = null;
    setCsrfToken(null);
    window.location.href = "/login";
  }
}

// Any protected call that returns 401 sends the user back to login.
onUnauthorized(() => {
  currentUser = null;
  const path = window.location.pathname;
  if (path !== "/login" && path !== "/") {
    window.location.href = `/login?next=${encodeURIComponent(path)}`;
  }
});

export function getLoginTarget() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
