export const prerender = true;
import type { APIRoute } from 'astro';
import schools from '../data/schools.json';
import pairsData from '../data/compare-pairs.json';

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().split('T')[0];
  const slugByUrn = new Map((schools as any[]).map((s) => [String(s.urn), s.slug]));
  const keys = (((pairsData as any).pairs as string) || '').split(' ').filter(Boolean);
  const urls = keys.flatMap((k) => {
    const [a, b] = k.split('-');
    const sa = slugByUrn.get(a), sb = slugByUrn.get(b);
    return sa && sb
      ? [`  <url><loc>https://catchment.school/compare/${sa}-vs-${sb}/</loc><lastmod>${lastmod}</lastmod><changefreq>yearly</changefreq><priority>0.5</priority></url>`]
      : [];
  }).join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } }
  );
};
