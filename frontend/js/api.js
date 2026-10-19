/* Thin API client: same-origin cookies, CSRF header, consistent error shape. */

const BASE = "/api";

let csrfToken = null;

export function setCsrfToken(token) {
  if (token) csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

/** Listeners notified when the session becomes invalid (401 on a protected route). */
const unauthorizedHandlers = [];
export function onUnauthorized(fn) {
  unauthorizedHandlers.push(fn);
}

async function request(path, options = {}) {
  const { method = "GET", body, formData, headers = {}, raw = false } = options;

  const finalHeaders = { ...headers };
  const opts = { method, credentials: "same-origin", headers: finalHeaders };

  if (body !== undefined && body !== null) {
    finalHeaders["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (formData) {
    opts.body = formData; // browser sets multipart boundary
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrfToken) {
    finalHeaders["X-CSRF-Token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(BASE + path, opts);
  } catch (cause) {
    const err = new Error("Could not reach the server. Check your connection and try again.");
    err.cause = cause;
    err.status = 0;
    throw err;
  }

  if (raw) return response;

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const err = new Error(
      (payload && payload.error) || `Request failed (${response.status}).`
    );
    err.status = response.status;
    err.payload = payload;
    if (response.status === 401) {
      csrfToken = null;
      unauthorizedHandlers.forEach((fn) => {
        try {
          fn();
        } catch {
          /* handler errors must not mask the original failure */
        }
      });
    }
    throw err;
  }

  return payload === null ? { data: null } : payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  del: (path) => request(path, { method: "DELETE" }),
  postForm: (path, formData) => request(path, { method: "POST", formData }),
  download: (path) => request(path, { method: "GET", raw: true }),
};

/** Query-string helper: api.get('/jobs?' + qs({ page, search })). */
export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
}
