// Theme preference: "light" | "dark" | "system", stored in localStorage["tt-theme"].
// "system" removes data-theme so the CSS follows prefers-color-scheme.

export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "tt-theme";

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage can be blocked; the theme still applies for this page view.
  }
}

/** Inline script for <head>: applies the saved theme before paint (no flash). */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
