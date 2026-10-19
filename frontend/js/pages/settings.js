/* Settings: profile/preferences form + change password + privacy info. */

import { api } from "/js/api.js";
import { requireAuth, loadSession, getUser } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import {
  toast, toastError, qs, withBusy, fieldError, clearFieldError, escapeHtml,
} from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "settings", title: "Settings" });

const profileForm = qs("#profile-form");
const passwordForm = qs("#password-form");

function fillProfile(data) {
  qs("#display-name").value = data.display_name || "";
  qs("#email").value = data.email || "";
  qs("#page-size").value = String(data.page_size || 10);
  qs("#default-sort").value = data.default_sort || "newest";

  const privacy = data.privacy || {};
  qs("#privacy-info").innerHTML = `
    <div>
      <p class="font-semibold text-on-surface">Data retention</p>
      <p class="mt-1 text-body-md">${escapeHtml(privacy.data_retention || "")}</p>
    </div>
    <div>
      <p class="font-semibold text-on-surface">Secure resume access</p>
      <p class="mt-1 text-body-md">${escapeHtml(privacy.secure_resume_access || "")}</p>
    </div>
    <div>
      <p class="font-semibold text-on-surface">Deletion process</p>
      <p class="mt-1 text-body-md">${escapeHtml(privacy.deletion_process || "")}</p>
    </div>`;
}

async function load() {
  try {
    const body = await api.get("/settings");
    fillProfile(body.data);
  } catch (err) {
    toastError(err);
    // Fall back to session data so the form is still usable.
    const user = getUser() || (await loadSession());
    if (user) fillProfile({ display_name: user.name, email: user.email });
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nameInput = qs("#display-name");
  const emailInput = qs("#email");
  clearFieldError(nameInput);
  clearFieldError(emailInput);

  const display_name = nameInput.value.trim();
  const email = emailInput.value.trim();
  let valid = true;
  if (!display_name) {
    fieldError(nameInput, "Display name is required.");
    valid = false;
  }
  if (!email) {
    fieldError(emailInput, "Email is required.");
    valid = false;
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fieldError(emailInput, "Enter a valid email address.");
    valid = false;
  }
  if (!valid) return;

  try {
    await withBusy(profileForm.querySelector('[type="submit"]'), async () => {
      const body = await api.put("/settings", {
        display_name,
        email,
        page_size: Number(qs("#page-size").value),
        default_sort: qs("#default-sort").value,
      });
      fillProfile(body.data);
      await loadSession(); // refresh cached user + header initials
    });
    toast("Profile saved.", "success");
  } catch (err) {
    toastError(err);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentInput = qs("#current-password");
  const newInput = qs("#new-password");
  const confirmInput = qs("#confirm-password");
  [currentInput, newInput, confirmInput].forEach(clearFieldError);

  const current_password = currentInput.value;
  const new_password = newInput.value;
  const confirm_password = confirmInput.value;

  let valid = true;
  if (!current_password) {
    fieldError(currentInput, "Enter your current password.");
    valid = false;
  }
  if (!new_password) {
    fieldError(newInput, "Enter a new password.");
    valid = false;
  } else if (new_password.length < 8) {
    fieldError(newInput, "Password must be at least 8 characters.");
    valid = false;
  }
  if (confirm_password !== new_password) {
    fieldError(confirmInput, "Passwords do not match.");
    valid = false;
  }
  if (!valid) return;

  try {
    await withBusy(passwordForm.querySelector('[type="submit"]'), async () => {
      await api.post("/auth/change-password", { current_password, new_password });
    });
    toast("Password updated.", "success");
    passwordForm.reset();
  } catch (err) {
    toastError(err);
  }
});

load();
