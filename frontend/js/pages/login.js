/* Login page: authenticate recruiters or applicants and redirect to the target page. */

import { login, redirectIfAuthenticated, getLoginTarget } from "/js/auth.js";
import { api } from "/js/api.js";
import { qs, toast, withBusy, clearFieldError, fieldError } from "/js/ui.js";

const form = qs("#login-form");
const emailInput = qs("#email");
const passwordInput = qs("#password");
const errorBox = qs("#form-error");
const toggle = qs("#toggle-password");
const submitBtn = qs("#submit-btn");

const params = new URLSearchParams(window.location.search);
let role = params.get("role") === "applicant" ? "applicant" : "recruiter";

const ROLE_COPY = {
  recruiter: {
    title: "Sign in to your workspace",
    subtitle: "Welcome back. Enter your recruiter credentials below.",
    icon: "badge",
    button: "Sign in as recruiter",
    prompt: "New to HireSense AI?",
    link: "/signup?role=recruiter",
    linkLabel: "Create a recruiter account",
    browsePrompt: "Looking for a role instead?",
    browseLabel: "Browse open positions",
  },
  applicant: {
    title: "Sign in to your applicant profile",
    subtitle: "Track applications and see AI-ranked jobs that fit your resume.",
    icon: "person_search",
    button: "Sign in as applicant",
    prompt: "New here?",
    link: "/signup?role=applicant",
    linkLabel: "Create an applicant account",
    browsePrompt: "Just browsing?",
    browseLabel: "Explore open roles",
  },
};

function applyRole(next) {
  role = next === "applicant" ? "applicant" : "recruiter";
  const copy = ROLE_COPY[role];
  qs("#login-title").textContent = copy.title;
  qs("#login-subtitle").textContent = copy.subtitle;
  qs("#role-icon").textContent = copy.icon;
  submitBtn.textContent = copy.button;
  qs("#signup-prompt").textContent = copy.prompt;
  const signupLink = qs("#signup-link");
  signupLink.href = copy.link;
  signupLink.textContent = copy.linkLabel;
  qs("#browse-prompt").textContent = copy.browsePrompt;
  qs("#browse-link").textContent = copy.browseLabel;

  document.querySelectorAll("[data-login-role]").forEach((button) => {
    const active = button.dataset.loginRole === role;
    button.setAttribute("aria-selected", String(active));
    button.className =
      "flex-1 rounded-lg px-3 py-2 text-body-md font-semibold transition " +
      (active
        ? "bg-surface-container-lowest text-on-surface shadow-sm"
        : "text-on-surface-variant hover:text-on-surface");
  });

  const demo = qs("#demo-credentials");
  if (demo) {
    const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    demo.classList.toggle("hidden", !(local && role === "recruiter"));
  }

  errorBox.classList.add("hidden");
  const url = new URL(window.location.href);
  if (role === "applicant") url.searchParams.set("role", "applicant");
  else url.searchParams.delete("role");
  history.replaceState({}, "", url);
}

document.querySelectorAll("[data-login-role]").forEach((button) => {
  button.addEventListener("click", () => applyRole(button.dataset.loginRole));
});
applyRole(role);

// Redirect signed-in users to their own home page.
async function redirectSignedIn() {
  if (role === "recruiter") {
    await redirectIfAuthenticated(getLoginTarget("/dashboard"));
    return;
  }
  try {
    const body = await api.get("/public/candidate/me");
    if (body.data?.candidate) {
      window.location.href = getLoginTarget("/profile");
    }
  } catch {
    /* stay on the form */
  }
}
redirectSignedIn();

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

  try {
    await withBusy(submitBtn, async () => {
      if (role === "applicant") {
        await api.post("/public/candidate/login", { email, password });
      } else {
        await login(email, password);
      }
    });
    toast(`Signed in as ${role === "applicant" ? "applicant" : "recruiter"}.`, "success");
    window.location.href = getLoginTarget(role === "applicant" ? "/profile" : "/dashboard");
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
