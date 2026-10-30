/**
 * Builds src/data/compare-pairs.json: the curated (indexable) comparison set.
 * For every Secondary / All through school, its 3 nearest Secondary / All through schools by
 * straight-line distance, deduplicated as unordered pairs, keeping only pairs where BOTH schools
 * have a non-null a8 in the latest performance year.
 * Run: node scripts/gen-compare-pairs.mjs [path/to/performance.json]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

// First batch only (default): pairs where either school is in compare-batch-councils.json or top-bing-schools.json. Expand to the full set with: node scripts/gen-compare-pairs.mjs --full
const FULL = process.argv.includes('--full');
const perfPath = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'data/performance.json';
if (!existsSync(perfPath)) { console.error(`Missing ${perfPath}`); process.exit(1); }
const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
const perf = JSON.parse(readFileSync(perfPath, 'utf8'));

// Latest a8 year per school: the newest of the two newest years with any a8 (provisional 2025-26, else 2024-25).
const yearsWithA8 = new Set();
for (const urn in perf) for (const y in perf[urn]) if (perf[urn][y]?.a8 != null) yearsWithA8.add(y);
const latestTwo = [...yearsWithA8].sort().slice(-2).reverse();
const latest = latestTwo[0];
console.log('a8 years considered:', latestTwo);

// Exclude FE colleges and 14+/16+ entry providers (UTCs, studio schools, sixth forms): no Year 7
// catchment, and their small 14-16 cohorts make Attainment 8 comparisons with 11-16/18 schools misleading.
const entryAge = (s) => { const m = /^(\d+)/.exec(String(s.ageRange ?? '')); return m ? Number(m[1]) : null; };
const sec = schools.filter((s) => (s.phase === 'Secondary' || s.phase === 'All through') && s.lat != null && s.lng != null
  && s.type !== 'Further education' && !(entryAge(s) != null && entryAge(s) >= 14));
const latestA8Year = (urn) => latestTwo.find((y) => perf[urn]?.[y]?.a8 != null) ?? null;
// Both schools need an a8 in the same year (newest year both have one).
const hasA8 = (u, v) => latestTwo.some((y) => perf[u]?.[y]?.a8 != null && perf[v]?.[y]?.a8 != null);
const R = 3958.8, rad = Math.PI / 180;
const dist = (a, b) => {
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const pairs = new Set();
for (const s of sec) {
  // Nearest 3 among ALL secondary/all-through schools, then filter by a8 (per spec: both need a8).
  const near = sec.filter((o) => o.urn !== s.urn).map((o) => [dist(s, o), o]).sort((x, y) => x[0] - y[0]).slice(0, 3);
  for (const [, o] of near) {
    if (!hasA8(s.urn, o.urn)) continue;
    const [a, b] = Number(s.urn) < Number(o.urn) ? [s.urn, o.urn] : [o.urn, s.urn];
    pairs.add(`${a}-${b}`);
  }
}
const councils = new Set(JSON.parse(readFileSync('src/data/compare-batch-councils.json', 'utf8')).councils);
const topUrns = new Set(JSON.parse(readFileSync('src/data/top-bing-schools.json', 'utf8')).map((s) => s.split('-').pop()));
const byUrn = new Map(schools.map((s) => [String(s.urn), s]));
const inBatch = (k) => k.split('-').some((u) => councils.has(byUrn.get(u)?.laSlug) || topUrns.has(u));
const all = [...pairs].sort();
const sorted = FULL ? all : all.filter(inBatch);
console.log(`full candidate pairs: ${all.length}; in batch: ${all.filter(inBatch).length}; writing ${FULL ? 'FULL' : 'batch'}`);
const out = JSON.stringify({ latestYear: latest, pairs: sorted.join(' ') });
writeFileSync('src/data/compare-pairs.json', out);
console.log(`secondary/all-through schools: ${sec.length}; curated pairs: ${sorted.length}; file bytes: ${out.length}`);
