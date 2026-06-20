# catchment-school — Project Brain

Per-repo brain, migrated from central claude-memory 2026-06-20. Canonical project memory now lives here.

## Current state

- **What:** catchment.school — programmatic SEO site, school catchment-area checker for England. 26,506 school pages (SSR) + ~1,277-1,290 static area/council/guide pages. ~27,795 total URLs.
- **Stack:** Astro 5/6 + Tailwind v4 + `@astrojs/cloudflare` adapter. Schools are SSR (`prerender = false`) served by **Cloudflare Workers** from **D1**; area/council/guide pages are prerendered static. (Site exceeded CF Pages 20k file limit → Workers + D1.)
- **Deploy:** GitHub Actions auto-deploy on push to `master`. Repo `sunnyp81/catchment-school`. CF account `sunnypat81@gmail.com` (ID `aba0a6722a4510842ca473315a8ba13e`), token is GitHub secret `CLOUDFLARE_API_TOKEN`. Deploy cmd inside CI: `cd dist/server && npx wrangler deploy --config wrangler.json`. Canonical local: `C:\Users\sunny\repos\catchment-school` (older notes say `\projects\` or `AppData\Local\Temp\` — both stale).
- **Revenue:** none — **AdSense/monetisation is OFF until ranking recovery.**
- **State (Jun 11):** RECOVERY from May 2026 core-update collapse (see warnings). De-programmatic rebuild in progress (Walsall pilot shipped).
- **Key URLs:** prod catchment.school; staging `catchment-school.sunnypat81.workers.dev`. GA4 `G-E79ZS7MK0H`.
- **D1:** db `catchment-school-db`, ID `e7606fc7-cef5-4996-a9c0-3fc17f707b67`, 26,506 schools. Re-import `node scripts/import-d1.mjs`; schema `scripts/d1-schema.sql`. KV (SESSION) `a47c19e9228849c4a8caeb025c69af75`.
- **Key files:** `src/pages/school/[slug].astro` (SSR, queries D1), `src/pages/area/[slug].astro`, `src/pages/council/[slug].astro`, `src/layouts/Base.astro` (editorial chrome + schema), `src/styles/redesign.css`, `src/data/council-intros.json` (174/178), `src/data/area-intros.json` (~76 towns), `astro.config.mjs` (sitemap filter), `src/pages/sitemap-schools.xml.ts`, `scripts/parse-schools.mjs` + `import-d1.mjs` + `gen-og.mjs`.

## Key facts & warnings

- 🔴 **May 2026 core-update collapse (Jun 11):** sharp break Jun 2 (May 31: 132 clicks → Jun 2: 2). Clean windows: May 14-20 = 1,066 clicks / 29,416 impr / pos 8.62 → Jun 3-9 = 3 clicks / 505 impr / pos 21.95. Clicks **-99.7%**, impr -98.3%. ALL template types hit. Ruled out technical (URL Inspection clean, indexed, robots OK). = **host-level trust/quality classifier flip applied uniformly** — auction suppression, not a ranking slide; no surviving cohort to copy from. Recovery = rebuild DOMAIN trust by making templates materially less programmatic + pruning thin pages. Same failure class as Mar 2026 update killing calculator.place / carehome / radon.tips.
- 🔴 **Recovery plan = de-programmatic, NOT title churn.** STOP broad title rewrites (CHECK-09 bulk-AI-edit risk). Add real per-entity data: oversubscription/fill-rate counts (computable from `schools.json` at build), Ofsted ratings (DfE GIAS, pending mapping), last-distance-admitted (DfE explore-education-statistics CSV — highest-value missing field), council admissions citations, catchment polygons (per-council open data, medium priority). Full rebuild design is in `catchment-rebuild-design-jun11` (central memory) — phased rollout, revert if any phase drops impressions >20% in 7d.
- 🔴 **Cloudflare "Block AI Scrapers and Crawlers" must be toggled OFF** (Dashboard → catchment.school → Security → Bots). CF prepends Disallow blocks for GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot/Bytespider/Amazonbot/meta-externalagent to robots.txt, overriding our allow rules + neutralising llms.txt. Verify: `curl https://catchment.school/robots.txt` should NOT contain `# BEGIN Cloudflare Managed Content`. Gating step for AI-search visibility — open since Apr 28.
- **Thin-page noindex gate:** `/area/` pages serve `noindex, follow` below a school-count threshold. Raised <5 → **<10** on Jun 11 (509/1,096 = 46.4% noindex). Sitemap filter in `astro.config.mjs` excludes noindex pages.
- **GSC property:** `sc-domain:catchment.school` on the **sunnypat81** account (siteOwner). NOT `https://catchment.school/` (old URL-prefix property, unverified, on 2012infinite). Always use the sc-domain form.
- **Sitemap-index must list BOTH** `sitemap-0.xml` (static) and `sitemap-schools.xml` (26,506 school URLs) — they were split, and the index once advertised only the static one (Jun 11 fix).
- 🔴 **Tailwind 4 cascade-layer gotcha:** unlayered CSS (e.g. `a { color: inherit }`) wins over utility classes because TW4 utilities live in `@layer utilities`. Always wrap base resets in `@layer base`.
- **Design preference (Sunny):** white surface + indigo/blue (#2563EB) accent + Inter Tight — he rejected paper-cream/school-green. Default to this for his sites unless he asks for warm/editorial tones.
- **Pending code levers (since Apr 28):** pre-generate `/postcode/{POSTCODE}/` static pages (site captures 0 postcode-search clicks despite the name); catchment polygon GeoJSON overlay (biggest moat); per-page OG variants; pre-render top schools by GSC clicks; self-host fonts/Leaflet; Ofsted + last-distance data enrichment.
- **Credentials:** CF token lives as a GitHub Actions secret / central vault — never inline here.

## History

- **~Mar-Apr 9:** launched. Apr 16 peak 413 clicks / pos 7.6, then Apr 18 honeymoon-bounce to 138 / pos 12.6.
- **Apr 19:** trust-signal deploy — AuthorByline, editorial-policy, Organization schema, per-council intros (top 20), school→hub link mesh. Daily monitor trigger live.
- **Apr 24:** growth sprint — CTR title rewrites all templates, sitemap split (index + static + schools), council intros for 154 more LAs (174/178), 3 guides expanded to 1,800-2,000 words.
- **Apr 28:** health audit (78/100) — found CF AI-bot block, town=LA "Derby, Derby" dedup bug (~4,000 pages, fixed), /postcode opportunity flagged, council data-quality bugs. Title rewrite to lead with school name + Ofsted year.
- **May 9:** GSC audit — explosive growth 0 → 4,378 clicks/28d, pos 8.3. Trailing-slash 301 fix (~3,977 Bing redirects), homepage title/desc, Bing sitemap submitted. Desktop CTR weak (1.4%).
- **May 26:** full redesign — white/indigo-blue/Inter Tight editorial chrome site-wide via Base.astro, llms.txt, Satori og:image, schema hardening, restored `/area/` thin noindex (<5). Deleted temp RedesignBase.astro.
- **Jun 2:** core-update collapse (-99.7%).
- **Jun 11:** collapse diagnosed (host-level quality demotion); de-programmatic rebuild design authored; Phase 0 shipped — sitemap-index fix, noindex gate <5→<10, Walsall pilot (capacity/demand prose + FSM context + official admissions citation + data-derived H2).