// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import towns from './src/data/towns.json' assert { type: 'json' };

// Build-time set of thin area URLs to exclude from sitemap-0.xml.
// Thin = fewer than 10 schools => under ~300 unique words (pSEO survival CHECK-01).
// These pages still render with noindex,follow so internal links work.
const thinAreaUrls = new Set(
  towns
    .filter(t => t.count < 10)
    .map(t => `https://catchment.school/area/${t.slug}/`)
);

export default defineConfig({
  site: 'https://catchment.school',
  trailingSlash: 'always',
  adapter: cloudflare(),
  integrations: [sitemap({
    // Include the custom schools sitemap (26,506 URLs built by sitemap-schools.xml.ts)
    // in the auto-generated sitemap-index.xml alongside the static-pages sitemap-0.xml.
    customSitemaps: ['https://catchment.school/sitemap-schools.xml'],
    // Exclude thin area pages from sitemap (mirrors the noindex,follow meta tag).
    filter: (url) => !thinAreaUrls.has(url),
  })],
  vite: {
    plugins: [tailwindcss()],
  },
});
