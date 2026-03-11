/**
 * Generates a slim geo JSON for client-side postcode proximity search.
 * Only includes: urn, slug, name, phase, type, town, postcode, lat, lng
 * Output goes to public/data/ so it's served as a static asset.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schools = JSON.parse(readFileSync(join(__dirname, '../src/data/schools.json'), 'utf8'));

// Extract postcode area (e.g. "SW1A 1AA" → "sw")
function postcodeArea(postcode) {
  const match = postcode.replace(/\s/g, '').match(/^([A-Z]{1,2})/i);
  return match ? match[1].toLowerCase() : 'other';
}

// Minimal fields + short keys
const byArea = {};
for (const s of schools) {
  const area = postcodeArea(s.postcode);
  if (!byArea[area]) byArea[area] = [];
  byArea[area].push({
    s: s.slug,
    n: s.name,
    p: s.phase,
    t: s.type,
    w: s.town,
    c: s.postcode,
    a: s.lat,
    o: s.lng,
  });
}

mkdirSync(join(__dirname, '../public/data/geo'), { recursive: true });
let total = 0;
for (const [area, records] of Object.entries(byArea)) {
  writeFileSync(join(__dirname, `../public/data/geo/${area}.json`), JSON.stringify(records));
  total += records.length;
}
// Also write an index of available areas
writeFileSync(join(__dirname, '../public/data/geo/index.json'), JSON.stringify(Object.keys(byArea)));
console.log(`Wrote ${total} schools across ${Object.keys(byArea).length} postcode areas to public/data/geo/`);
