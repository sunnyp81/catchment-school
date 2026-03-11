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

const geo = schools.map(s => ({
  slug: s.slug,
  name: s.name,
  phase: s.phase,
  type: s.type,
  town: s.town,
  postcode: s.postcode,
  lat: s.lat,
  lng: s.lng,
}));

mkdirSync(join(__dirname, '../public/data'), { recursive: true });
writeFileSync(join(__dirname, '../public/data/schools-geo.json'), JSON.stringify(geo));
console.log(`Wrote ${geo.length} schools to public/data/schools-geo.json`);
