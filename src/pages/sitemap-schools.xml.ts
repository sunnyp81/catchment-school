export const prerender = true;
import type { APIRoute } from 'astro';
import schools from '../data/schools.json';

export const GET: APIRoute = () => {
  const urls = (schools as any[]).map(s =>
    `  <url><loc>https://catchment.school/school/${s.slug}/</loc><lastmod>2026-04-23</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`
  ).join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } }
  );
};
