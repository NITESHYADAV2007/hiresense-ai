/* Login page: authenticate against the API and redirect to the target page. */

import { login, redirectIfAuthenticated, getLoginTarget } from "/js/auth.js";
import { qs, toast, withBusy, clearFieldError, fieldError } from "/js/ui.js";

const form = qs("#login-form");
const emailInput = qs("#email");
const passwordInput = qs("#password");
const errorBox = qs("#form-error");
const toggle = qs("#toggle-password");

// If a signed-in recruiter lands here, go straight to the workspace.
redirectIfAuthenticated(getLoginTarget());

toggle.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  const eye = qs("#eye-icon");
  if (eye) eye.textContent = showing ? "visibility_off" : "visibility";
});

[emailInput, passwordInput].forEach((input) =>
  input.addEventListener("input", () => {
    clearFieldError(input);
    errorBox.classList.add("hidden");
  })
);

// Show demo credentials for local development only (no bundler env vars here).
if (["localhost", "127.0.0.1", ""].includes(location.hostname)) {
  qs("#demo-credentials")?.classList.remove("hidden");
}

qs("#fill-demo")?.addEventListener("click", () => {
  emailInput.value = "recruiter@hiresense.dev";
  passwordInput.value = "Recruiter@123";
  emailInput.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  clearFieldError(emailInput);
  clearFieldError(passwordInput);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let valid = true;
  if (!email) {
    fieldError(emailInput, "Email is required.");
    valid = false;
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fieldError(emailInput, "Enter a valid email address.");
    valid = false;
  }
  if (!password) {
    fieldError(passwordInput, "Password is required.");
    valid = false;
  }
  if (!valid) return;

  const button = qs("#submit-btn");
  try {
    await withBusy(button, async () => {
      await login(email, password);
    });
    toast("Signed in successfully.", "success");
    window.location.href = getLoginTarget();
  } catch (err) {
    const message =
      err.status === 429
        ? err.message
        : err.status === 401
          ? "Incorrect email or password. Please try again."
          : err.message;
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    errorBox.scrollIntoView({ block: "nearest" });
  }
});

/* Theme toggle (light/dark) so the login page matches the rest of the app. */
function mountThemeToggle() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "fixed right-4 top-4 z-50 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-on-surface-variant shadow-sm hover:bg-surface-container-low";
  const sync = () => {
    const dark = window.HireSenseTheme?.resolved() === "dark";
    btn.innerHTML = `<span class="material-symbols-outlined text-[22px]" aria-hidden="true">${dark ? "light_mode" : "dark_mode"}</span>`;
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  };
  btn.addEventListener("click", () => {
    window.HireSenseTheme?.toggle();
    sync();
  });
  document.addEventListener("themechange", sync);
  document.body.appendChild(btn);
  sync();
}
mountThemeToggle();
