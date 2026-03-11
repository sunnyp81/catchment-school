// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://catchment.school',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
