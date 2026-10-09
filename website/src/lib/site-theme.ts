// The site skins (<html data-site-theme>). Styles: theme.css (Modern) and
// site-themes.css (retro). The choice is a per-browser preference kept in
// localStorage and shared by the landing page and the docs.

export const SITE_THEMES = [
  { id: "modern", label: "Modern", swatch: "linear-gradient(135deg, #05070d 55%, #1084d0 55% 75%, #00b0f0 75%)" },
  { id: "win9x", label: "Windows Classic", swatch: "linear-gradient(135deg, #008080 55%, #c0c0c0 55% 75%, #000080 75%)" },
  { id: "xp", label: "Windows XP", swatch: "linear-gradient(160deg, #245edb 50%, #6cae43 50% 75%, #3c9a3c 75%)" },
  { id: "win7", label: "Windows 7", swatch: "linear-gradient(135deg, #0c3b7c, #1a6fbf 50%, #78d2ff 50% 70%, #f0f0f0 70%)" },
] as const;

export type SiteThemeId = (typeof SITE_THEMES)[number]["id"];

export const SITE_THEME_KEY = "ovc-site-theme";

/**
 * Inline <head> script: applies the stored skin before first paint. With
 * `starlight`, also sets Starlight's own data-theme (dark for Modern, light
 * for the retro skins).
 */
export function themeInitScript(starlight = false): string {
  const ids = JSON.stringify(SITE_THEMES.map((t) => t.id));
  return `(() => {
  let theme = "modern";
  try { const stored = localStorage.getItem(${JSON.stringify(SITE_THEME_KEY)}); if (${ids}.includes(stored)) theme = stored; } catch {}
  document.documentElement.dataset.siteTheme = theme;
  ${starlight ? 'document.documentElement.dataset.theme = theme === "modern" ? "dark" : "light";' : ""}
})();`;
}
