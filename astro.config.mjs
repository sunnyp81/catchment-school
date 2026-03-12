// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { readFileSync } from 'fs';

// School pages are SSR (prerender=false) so the sitemap plugin misses them.
// Load slugs at build time and inject as customPages.
const schools = JSON.parse(readFileSync('./src/data/schools.json', 'utf8'));
const schoolUrls = schools.map((s) => `https://catchment.school/school/${s.slug}`);

export default defineConfig({
  site: 'https://catchment.school',
  adapter: cloudflare(),
  integrations: [sitemap({ customPages: schoolUrls })],
  vite: {
    plugins: [tailwindcss()],
  },
});
