// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://openvcenter.com",
  integrations: [
    // Docs live in src/content/docs/docs/, so they are served under /docs/.
    // The landing page (src/pages/index.astro) is not a Starlight page.
    starlight({
      title: "Open vCenter",
      description:
        "Documentation for Open vCenter, the open source web console for Microsoft Hyper-V.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/docs.css"],
      components: {
        SiteTitle: "./src/components/docs/SiteTitle.astro",
        SocialIcons: "./src/components/docs/SocialIcons.astro",
        ThemeProvider: "./src/components/docs/ThemeProvider.astro",
        ThemeSelect: "./src/components/docs/ThemeSelect.astro",
      },
      expressiveCode: {
        themes: ["github-dark-default"],
        styleOverrides: { borderRadius: "0.75rem" },
      },
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Overview", slug: "docs" },
            "docs/docker-compose",
            "docs/kubernetes",
            "docs/running",
          ],
        },
        {
          label: "How it works",
          items: ["docs/architecture", "docs/components", "docs/dependencies"],
        },
      ],
    }),
    react(),
  ],

  vite: {
    plugins: [tailwindcss()],
    // The stack explorer reads ../quick-install/ (src/lib/stack-data.ts).
    server: { fs: { allow: [".."] } },
  },
});
