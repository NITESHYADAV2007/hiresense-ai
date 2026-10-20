/* Signup page: create a recruiter workspace or an applicant account. */

import { api, setCsrfToken } from "/js/api.js";
import { qs, toast, withBusy, clearFieldError, fieldError } from "/js/ui.js";

const params = new URLSearchParams(window.location.search);
let role = params.get("role") === "applicant" ? "applicant" : "recruiter";

const COPY = {
  recruiter: {
    title: "Create your recruiter account",
    subtitle: "Post jobs, review AI-assisted matches, and run your pipeline.",
    icon: "badge",
    signin: "/login?role=recruiter",
  },
  applicant: {
    title: "Create your applicant account",
    subtitle: "Save your profile and get AI-ranked job matches.",
    icon: "person_search",
    signin: "/login?role=applicant",
  },
};

function setError(box, message) {
  if (!message) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.textContent = message;
  box.classList.remove("hidden");
  box.scrollIntoView({ block: "nearest" });
}

function setRole(next) {
  role = next === "applicant" ? "applicant" : "recruiter";
  const copy = COPY[role];
  qs("#signup-title").textContent = copy.title;
  qs("#signup-subtitle").textContent = copy.subtitle;
  qs("#signup-icon").textContent = copy.icon;
  qs("#signin-link").href = copy.signin;
  qs("#recruiter-signup").classList.toggle("hidden", role !== "recruiter");
  qs("#applicant-signup").classList.toggle("hidden", role !== "applicant");

  document.querySelectorAll("[data-signup-role]").forEach((button) => {
    const active = button.dataset.signupRole === role;
    button.setAttribute("aria-selected", String(active));
    button.className =
      "flex-1 rounded-lg px-3 py-2 text-body-md font-semibold transition " +
      (active
        ? "bg-surface-container-lowest text-on-surface shadow-sm"
        : "text-on-surface-variant hover:text-on-surface");
  });

  setError(qs("#recruiter-error"), "");
  setError(qs("#applicant-error"), "");

  const url = new URL(window.location.href);
  if (role === "applicant") url.searchParams.set("role", "applicant");
  else url.searchParams.delete("role");
  history.replaceState({}, "", url);
}

document.querySelectorAll("[data-signup-role]").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.signupRole));
});
setRole(role);

function validateBase({ nameInput, emailInput, passwordInput, confirmInput }) {
  let valid = true;
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (!name) {
    fieldError(nameInput, "Please enter your full name.");
    valid = false;
  }
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
  } else if (password.length < 8) {
    fieldError(passwordInput, "Use at least 8 characters.");
    valid = false;
  }
  if (password !== confirm) {
    fieldError(confirmInput, "Passwords do not match.");
    valid = false;
  }
  return valid;
}

function clearFormErrors(inputs, box) {
  inputs.forEach(clearFieldError);
  setError(box, "");
}

/* ---------------- recruiter ---------------- */

const recruiterInputs = [
  qs("#recruiter-name"),
  qs("#recruiter-email"),
  qs("#recruiter-password"),
  qs("#recruiter-confirm"),
];

recruiterInputs.forEach((input) =>
  input.addEventListener("input", () => {
    clearFieldError(input);
    setError(qs("#recruiter-error"), "");
  })
);

qs("#recruiter-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = qs("#recruiter-error");
  clearFormErrors(recruiterInputs, errorBox);

  const [nameInput, emailInput, passwordInput, confirmInput] = recruiterInputs;
  if (!validateBase({ nameInput, emailInput, passwordInput, confirmInput })) return;

  try {
    await withBusy(qs("#recruiter-submit"), async () => {
      const body = await api.post("/auth/register", {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
      });
      setCsrfToken(body.data.csrf_token);
    });
    toast("Recruiter account created. Welcome to HireSense AI.", "success");
    window.location.href = "/dashboard";
  } catch (err) {
    setError(
      errorBox,
      err.status === 404
        ? "Recruiter signup is not enabled on this server yet."
        : err.message || "Could not create your account."
    );
  }
});

/* ---------------- applicant ---------------- */

const applicantInputs = [
  qs("#applicant-name"),
  qs("#applicant-email"),
  qs("#applicant-phone"),
  qs("#applicant-password"),
  qs("#applicant-confirm"),
];

applicantInputs.forEach((input) =>
  input.addEventListener("input", () => {
    clearFieldError(input);
    setError(qs("#applicant-error"), "");
  })
);

const resumeInput = qs("#applicant-resume");
resumeInput.addEventListener("change", () => {
  const file = resumeInput.files?.[0];
  qs("#resume-label").textContent = file ? file.name : "Choose a PDF resume";
  if (file && !file.name.toLowerCase().endsWith(".pdf")) {
    setError(qs("#applicant-error"), "Your resume must be a PDF file.");
  } else {
    setError(qs("#applicant-error"), "");
  }
});

qs("#applicant-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = qs("#applicant-error");
  clearFormErrors(applicantInputs, errorBox);

  const [nameInput, emailInput, phoneInput, passwordInput, confirmInput] = applicantInputs;
  if (!validateBase({ nameInput, emailInput, passwordInput, confirmInput })) return;

  const resume = resumeInput.files?.[0];
  if (resume && !resume.name.toLowerCase().endsWith(".pdf")) {
    setError(errorBox, "Your resume must be a PDF file.");
    return;
  }
  if (resume && resume.size > 5 * 1024 * 1024) {
    setError(errorBox, "Your resume must be 5 MB or smaller.");
    return;
  }

  const data = new FormData();
  data.append("name", nameInput.value.trim());
  data.append("email", emailInput.value.trim());
  data.append("phone", phoneInput.value.trim());
  data.append("password", passwordInput.value);
  data.append("confirm_password", confirmInput.value);
  if (resume) data.append("resume", resume);

  try {
    await withBusy(qs("#applicant-submit"), async () => {
      await api.postForm("/public/candidate/register", data);
    });
    toast("Applicant account created. Add your resume to see matches.", "success");
    window.location.href = "/profile";
  } catch (err) {
    setError(errorBox, err.message || "Could not create your account.");
  }
});
