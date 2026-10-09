# Open vCenter website

The Open vCenter website ([openvcenter.com](https://openvcenter.com)): a static
[Astro](https://astro.build) site with React islands and Tailwind CSS v4, served
by Cloudflare Workers as static assets. The docs (`/docs/`) are
[Starlight](https://starlight.astro.build) pages in the same project.

Run every command below from this `website/` folder.

## Commands

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm install`        | Install dependencies (the project `.npmrc` forces the public npm registry)   |
| `npm run dev`        | Dev server at http://localhost:4321                                          |
| `npm run build`      | Build the static site into `dist/`                                           |
| `npm run check`      | Type-check `.astro`, `.ts` and `.tsx` files                                  |
| `npm run cf:preview` | Build and serve `dist/` locally on the Workers runtime (`wrangler dev`)      |
| `npm run deploy`     | Build and deploy to Cloudflare Workers (`wrangler deploy`, needs `wrangler login`) |

## Docs

The documentation is MDX in `src/content/docs/docs/` (the extra `docs/`
puts it under `/docs/`); the sidebar order is in `astro.config.mjs`. Pages can
use Starlight components and the site's own, e.g.
`<StackExplorerIsland mode="k8s" />`. Search is built by Pagefind at build time.

`public/_redirects` maps the old GitHub Pages URLs (`/architecture`,
`/kubernetes.html`, ...) to `/docs/...`; Workers static assets apply it.

## The stack explorer

The interactive diagram (landing page and docs) is built from the
repository's own `quick-install/docker/` and `quick-install/kubernetes/`
files, read at build time by `src/lib/stack-data.ts` - change a compose file
or manifest and the explorer follows on the next build. The dev server is
allowed to read outside `website/` for this (`server.fs.allow` in
`astro.config.mjs`).

## Deploying

Cloudflare Workers Builds, connected to this repository with **root
directory** `website`, build command `npm run build` and deploy command
`npx wrangler deploy`. Limit the build watch paths to `website/**` and
`quick-install/**`. Or deploy by hand with `npm run deploy`.

## Layout

```
src/pages/index.astro                 the landing page
src/layouts/Base.astro                <head>, header, footer (landing page)
src/content/docs/docs/                the docs (Starlight, MDX)
src/components/docs/                  Starlight overrides: header title/actions, dark-only theme
src/components/stack/                 the stack explorer (React Flow island)
src/lib/stack-model.ts                hand-curated: components, connections, layout, request flow
src/lib/stack-data.ts                 build time: parses the YAML into facts + highlighted source
src/styles/theme.css, components.css  tokens (Modern skin) and component classes shared by both
src/styles/site-themes.css            the Windows Classic / XP / 7 skins
src/components/ThemePicker.astro      the skin menu (header, docs header and mobile menu)
src/styles/global.css                 landing page CSS (full Tailwind)
src/styles/docs.css                   docs CSS (Starlight + Tailwind, site palette)
wrangler.jsonc                        Workers static-assets config
```
