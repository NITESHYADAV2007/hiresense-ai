/* Create / edit a job. The same page serves /jobs/new and /jobs/:id/edit. */

import { api } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { escapeHtml, fieldError, clearFieldError, toast, toastError, qs } from "/js/ui.js";

await requireAuth();

const pathParts = window.location.pathname.split("/").filter(Boolean);
const editId = pathParts[0] === "jobs" && pathParts[2] === "edit" ? pathParts[1] : null;
const isEdit = Boolean(editId);

mountRecruiterLayout({ active: "jobs", title: isEdit ? "Edit Job" : "Create Job" });

document.title = `${isEdit ? "Edit Job" : "Create Job"} · HireSense AI`;
qs("#form-title").textContent = isEdit ? "Edit Job" : "Create Job";
qs("#submit-btn").textContent = isEdit ? "Save changes" : "Create Job";

const form = qs("#job-form");
const errorBox = qs("#form-error");

/* ---------- character counters + skill tags ---------- */

["title", "description"].forEach((name) => {
  const input = form.elements[name];
  const counter = qs(`[data-count="${name}"]`);
  const sync = () => {
    counter.textContent = String(input.value.length);
  };
  input.addEventListener("input", () => {
    sync();
    clearFieldError(input);
    errorBox.classList.add("hidden");
  });
  sync();
});

function parseSkills() {
  return qs("#required_skills")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderSkillTags() {
  const skills = parseSkills();
  qs("#skill-tags").innerHTML = skills
    .map(
      (skill) =>
        `<span class="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-3 py-1 text-body-sm font-semibold text-on-primary-fixed-variant">
          ${escapeHtml(skill)}
          <button type="button" data-remove-skill="${escapeHtml(skill)}" class="material-symbols-outlined rounded-full p-0.5 text-[14px] hover:bg-primary hover:text-on-primary" aria-label="Remove ${escapeHtml(skill)}">close</button>
        </span>`
    )
    .join("");
  qs("[data-remove-skill]") &&
    Array.from(document.querySelectorAll("[data-remove-skill]")).forEach((btn) =>
      btn.addEventListener("click", () => {
        const target = btn.dataset.removeSkill.toLowerCase();
        const next = parseSkills().filter((s) => s.toLowerCase() !== target);
        qs("#required_skills").value = next.join(", ");
        renderSkillTags();
      })
    );
}

qs("#required_skills").addEventListener("input", () => {
  renderSkillTags();
  clearFieldError(qs("#required_skills"));
});

/* ---------- load existing job when editing ---------- */

if (isEdit) {
  try {
    const body = await api.get(`/jobs/${editId}`);
    const job = body.data;
    form.elements.title.value = job.title;
    form.elements.department.value = job.department;
    form.elements.location.value = job.location;
    form.elements.employment_type.value = job.employment_type;
    form.elements.experience_level.value = job.experience_level;
    form.elements.description.value = job.description;
    form.elements.required_skills.value = (job.required_skills || []).join(", ");
    qs('[data-count="title"]').textContent = String(job.title.length);
    qs('[data-count="description"]').textContent = String(job.description.length);
    renderSkillTags();
  } catch (err) {
    if (err.status === 404) {
      toastError(new Error("This job does not exist."));
      setTimeout(() => (window.location.href = "/jobs"), 1200);
    } else {
      toastError(err);
    }
  }
}

/* ---------- validation ---------- */

const rules = {
  title: (v) => (!v.trim() ? "Job title is required." : v.length > 160 ? "Title is too long." : null),
  department: (v) => (!v.trim() ? "Department is required." : null),
  location: (v) => (!v.trim() ? "Location is required." : null),
  employment_type: (v) => (!v ? "Select an employment type." : null),
  experience_level: (v) => (!v ? "Select an experience level." : null),
  description: (v) => (!v.trim() ? "Job description is required." : null),
  required_skills: (v) => (!parseSkills().length ? "Add at least one required skill." : null),
};

Object.keys(rules).forEach((name) => {
  const input = form.elements[name];
  if (input) input.addEventListener("change", () => clearFieldError(input));
});

function validate() {
  let valid = true;
  Object.entries(rules).forEach(([name, rule]) => {
    const input = form.elements[name];
    const message = rule(input.value);
    if (message) {
      fieldError(input, message);
      valid = false;
    } else {
      clearFieldError(input);
    }
  });
  return valid;
}

/* ---------- submit ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  if (!validate()) return;

  const payload = {
    title: form.elements.title.value.trim(),
    department: form.elements.department.value.trim(),
    location: form.elements.location.value.trim(),
    employment_type: form.elements.employment_type.value,
    experience_level: form.elements.experience_level.value,
    description: form.elements.description.value.trim(),
    required_skills: parseSkills(),
  };

  const button = qs("#submit-btn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = isEdit ? "Saving…" : "Creating…";

  try {
    if (isEdit) {
      const body = await api.put(`/jobs/${editId}`, payload);
      toast("Job updated.", "success");
      window.location.href = `/jobs/${body.data.id}`;
    } else {
      const body = await api.post("/jobs", payload);
      toast("Job created.", "success");
      window.location.href = `/jobs/${body.data.id}`;
    }
  } catch (err) {
    // Preserve the entered data on failure.
    button.disabled = false;
    button.textContent = original;
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
    toastError(err);
  }
});

renderSkillTags();
