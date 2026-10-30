import { env } from 'cloudflare:workers';

// Serves the prerendered /404.html with a real 404 status and noindex.
export async function notFoundResponse(url: URL): Promise<Response> {
  const headers = { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' };
  try {
    const r = await (env as any).ASSETS.fetch(new URL('/404.html', url));
    if (r.ok) return new Response(r.body, { status: 404, headers });
  } catch { /* fall through to inline page */ }
  return new Response(
    '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title></head><body style="font-family:system-ui;max-width:36rem;margin:3rem auto;padding:0 1rem"><h1>We could not find that page</h1><p><a href="/postcode/">Search schools by postcode</a> or <a href="/">go to the home page</a>.</p></body></html>',
    { status: 404, headers }
  );
}
