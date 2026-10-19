/* Candidate application form: client validation + multipart upload. */

import { api } from "/js/api.js";
import { mountPublicNav, mountPublicFooter } from "/js/layout.js";
import { escapeHtml, fieldError, clearFieldError, withBusy, toast } from "/js/ui.js";

mountPublicNav({ active: "careers" });
mountPublicFooter();

const jobId = window.location.pathname.split("/").pop();
const MAX_BYTES = 5 * 1024 * 1024;

const form = document.querySelector("#apply-form");
const fileInput = document.querySelector("#resume");
const dropzone = document.querySelector("#dropzone");
const errorBox = document.querySelector("#form-error");
let selectedFile = null;

async function loadJob() {
  try {
    const body = await api.get(`/public/jobs/${encodeURIComponent(jobId)}`);
    const job = body.data;
    document.title = `Apply — ${job.title} · HireSense AI`;

    const summary = document.querySelector("#job-summary");
    summary.innerHTML = `
      <p class="text-label-md uppercase tracking-wide text-primary">You are applying for</p>
      <h1 class="mt-1.5 font-headline-sm text-headline-sm text-on-surface">${escapeHtml(job.title)}</h1>
      <p class="mt-1 text-body-md text-on-surface-variant">${escapeHtml(job.department)} · ${escapeHtml(job.location)} · ${escapeHtml(job.employment_type)}</p>`;

    if (job.status !== "open") {
      summary.classList.add("hidden");
      document.querySelector("#job-unavailable").classList.remove("hidden");
      return;
    }
    form.classList.remove("hidden");
    prefillFromProfile();
  } catch (err) {
    document.querySelector("#job-summary").classList.add("hidden");
    const box = document.querySelector("#not-found");
    box.classList.remove("hidden");
    if (err.status !== 404) {
      box.querySelector("p").textContent = err.message;
    }
  }
}

/* Prefill from a saved candidate profile (passwordless, cookie-based). */
async function prefillFromProfile() {
  try {
    const body = await api.get("/public/candidate/me");
    const candidate = body && body.data && body.data.candidate;
    if (!candidate) return;
    if (!form.elements.candidate_name.value) {
      form.elements.candidate_name.value = candidate.name || "";
    }
    if (!form.elements.email.value) form.elements.email.value = candidate.email || "";
    if (!form.elements.phone.value) form.elements.phone.value = candidate.phone || "";
  } catch {
    /* prefill is best-effort */
  }
}

/* ---------- file selection ---------- */

function setFile(file) {
  errorBox.classList.add("hidden");
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
    fieldError(fileInput, "Please choose a PDF file.");
    return;
  }
  if (file.size > MAX_BYTES) {
    fieldError(fileInput, "That file is larger than 5 MB. Please upload a smaller PDF.");
    return;
  }
  clearFieldError(fileInput);
  selectedFile = file;
  document.querySelector("#file-name").textContent = file.name;
  document.querySelector("#file-size").textContent = `${(file.size / 1024).toFixed(0)} KB`;
  document.querySelector("#upload-idle").classList.add("hidden");
  document.querySelector("#upload-selected").classList.remove("hidden");
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  document.querySelector("#upload-idle").classList.remove("hidden");
  document.querySelector("#upload-selected").classList.add("hidden");
}

fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
document.querySelector("#remove-file").addEventListener("click", clearFile);

["dragenter", "dragover"].forEach((name) =>
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("border-primary", "bg-primary-fixed/60");
  })
);
["dragleave", "drop"].forEach((name) =>
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("border-primary", "bg-primary-fixed/60");
  })
);
dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
    } catch {
      /* older browsers: keep our own reference */
    }
    setFile(file);
  }
});

/* ---------- validation ---------- */

const validators = {
  candidate_name: (value) => {
    if (!value.trim()) return "Full name is required.";
    if (value.trim().length > 160) return "Name is too long.";
    return null;
  },
  email: (value) => {
    if (!value.trim()) return "Email address is required.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) return "Enter a valid email address.";
    return null;
  },
  phone: (value) => {
    if (!value.trim()) return "Phone number is required.";
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "Enter a valid phone number.";
    return null;
  },
  portfolio_url: (value) => {
    if (!value.trim()) return null;
    if (!/^https?:\/\//i.test(value.trim())) return "URL must start with http:// or https://.";
    return null;
  },
};

Object.keys(validators).forEach((name) => {
  const input = form.elements[name];
  input.addEventListener("input", () => clearFieldError(input));
});

function validateForm() {
  let valid = true;
  Object.entries(validators).forEach(([name, validate]) => {
    const input = form.elements[name];
    const message = validate(input.value);
    if (message) {
      fieldError(input, message);
      valid = false;
    } else {
      clearFieldError(input);
    }
  });

  if (!selectedFile) {
    fieldError(fileInput, "A PDF resume is required.");
    valid = false;
  } else {
    clearFieldError(fileInput);
  }
  return valid;
}

/* ---------- submission ---------- */

let progressTimer = null;
function startProgress() {
  const wrap = document.querySelector("#upload-progress");
  const bar = document.querySelector("#progress-bar");
  wrap.classList.remove("hidden");
  let width = 15;
  bar.style.width = `${width}%`;
  progressTimer = setInterval(() => {
    width = Math.min(width + 8, 90);
    bar.style.width = `${width}%`;
  }, 350);
}

function stopProgress(success) {
  clearInterval(progressTimer);
  const bar = document.querySelector("#progress-bar");
  if (success) bar.style.width = "100%";
  setTimeout(() => document.querySelector("#upload-progress").classList.add("hidden"), 400);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");

  if (!validateForm()) return;

  const submitBtn = document.querySelector("#submit-btn");
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  startProgress();

  const formData = new FormData();
  formData.append("candidate_name", form.elements.candidate_name.value.trim());
  formData.append("email", form.elements.email.value.trim());
  formData.append("phone", form.elements.phone.value.trim());
  formData.append("portfolio_url", form.elements.portfolio_url.value.trim());
  formData.append("resume", selectedFile, selectedFile.name);

  try {
    const body = await api.postForm(
      `/public/jobs/${encodeURIComponent(jobId)}/applications`,
      formData
    );
    stopProgress(true);
    const reference = body.data.public_reference;
    window.location.href = `/application-success/${encodeURIComponent(reference)}`;
  } catch (err) {
    stopProgress(false);
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
    errorBox.textContent = err.message || "Your application could not be submitted. Please try again.";
    errorBox.classList.remove("hidden");
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(errorBox.textContent, "error");
  } finally {
    form.classList.remove("busy");
  }
});

loadJob();
