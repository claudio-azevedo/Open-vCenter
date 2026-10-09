# Open vCenter website

Website and documentation for Open vCenter. Static Astro 7 + React 19 islands +
Tailwind v4, docs on Starlight under `/docs/`, deployed to Cloudflare Workers as
static assets (`wrangler.jsonc`, no adapter, no SSR). See README.md for commands
and layout.

## Conventions

- Four skins, picked from the header menu (`ThemePicker.astro`) and stored in
  localStorage: Modern (default, dark) and the retro Windows Classic / XP / 7
  (light), mirroring ovc-frontend's own themes. A skin is
  `<html data-site-theme>` plus CSS variables only - components never branch
  on it. Modern's values: `src/styles/theme.css`; retro: `site-themes.css`.
- Use the token utilities (`bg-surface`, `text-muted`, `border-line`,
  `text-brand`) and the `--skin-*` / `--flow-*` / `--kind-*` variables, never
  raw colours. Retro skins have two token scopes: `.desktop` (text on the
  wallpaper) and window (`.card`, `.window`, `.on-window`, the header) - tag a
  framed element with one of those classes so it gets dark-on-light text.
- In `theme.css`, `--skin-*` values must be literals: a `var()` there is
  resolved on `:root` and won't follow the local token scope. Put the
  fallback in the rule that uses it instead (see `components.css`).
- Check a visual change in all four skins.
- The docs in `src/content/docs/docs/` are the only copy of the documentation.
  Internal links are absolute (`/docs/kubernetes/#roles`); keep headings stable,
  their slugs are link targets. Wrap any React island in `not-content` (as
  `StackExplorerIsland` does) so Starlight's prose styles leave it alone.
- Docs CSS has no Tailwind preflight: islands used in the docs get a small
  scoped reset in `docs.css` - extend it there if a component needs more.
- Static by default: only add a `client:*` directive where interaction is
  needed. Today that is only `StackExplorer` (`client:visible`).
- The site lives in the Open vCenter repository's `website/` folder. The
  stack explorer reads `../quick-install/` directly at build time - never copy
  those files into `website/`.
- Screenshots in `src/assets/screenshots/` stay PNG: the transparent margin
  around the window matters on the light skins.
- The stack explorer splits curated vs derived data: what a component *is*,
  its connections, diagram positions and the request-flow steps live in
  `src/lib/stack-model.ts`; image, ports, volumes and YAML come from the real
  files via `src/lib/stack-data.ts` (build time only - never import it from
  client code except as `import type`).
- Product claims (features, demo behaviour) must match the actual Open vCenter
  repos and docs.
- Run `npm run check` and `npm run build` before finishing a change.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Astro docs: https://docs.astro.build
