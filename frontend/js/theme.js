/* Theme bootstrapping for HireSense AI.
 *
 * Loaded synchronously in every page <head> so the saved (or system) theme is
 * applied before the first paint — no flash of the wrong colours.
 *
 * Preferences: "light" | "dark" | "system" (default).
 * The UI toggles live in layout.js / login.js and call window.HireSenseTheme.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "hiresense-theme";
  var root = document.documentElement;

  function prefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function getPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch (e) {
      return "system";
    }
  }

  function resolved() {
    var pref = getPreference();
    return pref === "system" ? (prefersDark() ? "dark" : "light") : pref;
  }

  function apply() {
    var theme = resolved();
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      document.dispatchEvent(
        new CustomEvent("themechange", { detail: { theme: theme } })
      );
    } catch (e) {
      /* CustomEvent unsupported: ignore */
    }
  }

  function set(preference) {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (e) {
      /* storage unavailable: apply anyway for this page view */
    }
    apply();
  }

  function toggle() {
    set(resolved() === "dark" ? "light" : "dark");
  }

  apply();

  // Follow the operating system while the preference is "system".
  if (window.matchMedia) {
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (getPreference() === "system") apply();
    };
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else if (mql.addListener) mql.addListener(onChange);
  }

  window.HireSenseTheme = {
    get: getPreference,
    resolved: resolved,
    set: set,
    toggle: toggle,
    apply: apply,
  };
})();
