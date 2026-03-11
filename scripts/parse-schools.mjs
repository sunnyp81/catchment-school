/**
 * Parses the GIAS schools CSV and generates static JSON for Astro.
 * Run: node scripts/parse-schools.mjs
 */

import { createReadStream, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const OUT_DIR = join(__dirname, '../src/data');
mkdirSync(OUT_DIR, { recursive: true });

// British National Grid → WGS84 (simplified Helmert transform, ~5m accuracy)
function bngToLatLng(easting, northing) {
  const a = 6377563.396, b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = 49 * Math.PI / 180;
  const lon0 = -2 * Math.PI / 180;
  const N0 = -100000, E0 = 400000;

  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let lat = lat0;
  let M = 0;

  do {
    lat = (northing - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (lat - lat0);
    const Mb = (3 * n + 3 * n * n + (21 / 8) * n * n * n) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    const Mc = ((15 / 8) * n * n + (15 / 8) * n * n * n) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    const Md = (35 / 24) * n * n * n * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(northing - N0 - M) >= 0.00001);

  const cosLat = Math.cos(lat), sinLat = Math.sin(lat), tanLat = Math.tan(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;

  const VII = tanLat / (2 * rho * nu);
  const VIII = tanLat / (24 * rho * nu * nu * nu) * (5 + 3 * tanLat * tanLat + eta2 - 9 * tanLat * tanLat * eta2);
  const IX = tanLat / (720 * rho * Math.pow(nu, 5)) * (61 + 90 * tanLat * tanLat + 45 * Math.pow(tanLat, 4));
  const X = 1 / (cosLat * nu);
  const XI = 1 / (cosLat * 6 * nu * nu * nu) * (nu / rho + 2 * tanLat * tanLat);
  const XII = 1 / (cosLat * 120 * Math.pow(nu, 5)) * (5 + 28 * tanLat * tanLat + 24 * Math.pow(tanLat, 4));
  const XIIA = 1 / (cosLat * 5040 * Math.pow(nu, 7)) * (61 + 662 * tanLat * tanLat + 1320 * Math.pow(tanLat, 4) + 720 * Math.pow(tanLat, 6));

  const dE = easting - E0;
  const latRad = lat - VII * dE * dE + VIII * Math.pow(dE, 4) - IX * Math.pow(dE, 6);
  const lonRad = lon0 + X * dE - XI * Math.pow(dE, 3) + XII * Math.pow(dE, 5) - XIIA * Math.pow(dE, 7);

  return {
    lat: parseFloat((latRad * 180 / Math.PI).toFixed(6)),
    lng: parseFloat((lonRad * 180 / Math.PI).toFixed(6)),
  };
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PHASE_LABELS = {
  '0': 'Not applicable',
  '1': 'Nursery',
  '2': 'Primary',
  '3': 'Middle deemed primary',
  '4': 'Secondary',
  '5': 'Middle deemed secondary',
  '6': 'All through',
  '7': 'Special',
};

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, relax_quotes: true }))
      .on('data', row => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

async function main() {
  console.log('Parsing GIAS schools CSV...');
  const raw = await parseCSV(join(DATA_DIR, 'schools-raw.csv'));
  console.log(`  Loaded ${raw.length} raw records`);

  const schools = [];
  const skipped = { closed: 0, noLocation: 0 };

  for (const r of raw) {
    // Only open schools
    if (r['EstablishmentStatus (code)'] !== '1') { skipped.closed++; continue; }

    const easting = parseInt(r['Easting']);
    const northing = parseInt(r['Northing']);
    if (!easting || !northing) { skipped.noLocation++; continue; }

    const { lat, lng } = bngToLatLng(easting, northing);

    const urn = r['URN'];
    const name = r['EstablishmentName'];
    const phaseCode = r['PhaseOfEducation (code)'];
    const phase = PHASE_LABELS[phaseCode] ?? 'Other';
    const la = r['LA (name)'] ?? '';
    const town = r['Town'] ?? '';
    const postcode = r['Postcode'] ?? '';

    schools.push({
      urn,
      slug: slugify(name + '-' + urn),
      name,
      type: r['TypeOfEstablishment (name)'] ?? '',
      phase,
      phaseCode,
      gender: r['Gender (name)'] ?? '',
      religion: r['ReligiousCharacter (name)'] ?? '',
      la,
      laSlug: slugify(la),
      district: r['DistrictAdministrative (name)'] ?? '',
      districtSlug: slugify(r['DistrictAdministrative (name)'] ?? ''),
      town,
      townSlug: slugify(town),
      county: r['County (name)'] ?? '',
      postcode,
      street: r['Street'] ?? '',
      locality: r['Locality'] ?? '',
      ageRange: r['StatutoryLowAge'] && r['StatutoryHighAge']
        ? `${r['StatutoryLowAge']}–${r['StatutoryHighAge']}`
        : null,
      capacity: r['SchoolCapacity'] ? parseInt(r['SchoolCapacity']) : null,
      pupils: r['NumberOfPupils'] ? parseInt(r['NumberOfPupils']) : null,
      fsm: r['PercentageFSM'] ? parseFloat(r['PercentageFSM']) : null,
      website: r['SchoolWebsite'] ?? null,
      admissionsPolicy: r['AdmissionsPolicy (name)'] ?? '',
      lat,
      lng,
    });
  }

  console.log(`  Processed: ${schools.length} open schools (skipped ${skipped.closed} closed, ${skipped.noLocation} no location)`);

  // Write individual school lookup
  const schoolByUrn = {};
  for (const s of schools) schoolByUrn[s.urn] = s;
  writeFileSync(join(OUT_DIR, 'schools.json'), JSON.stringify(schools));
  console.log(`  Wrote schools.json`);

  // Build town index
  const byTown = {};
  for (const s of schools) {
    if (!s.town || !s.townSlug) continue;
    if (!byTown[s.townSlug]) {
      byTown[s.townSlug] = { slug: s.townSlug, name: s.town, la: s.la, laSlug: s.laSlug, count: 0 };
    }
    byTown[s.townSlug].count++;
  }
  const towns = Object.values(byTown).filter(t => t.count >= 2).sort((a, b) => b.count - a.count);
  writeFileSync(join(OUT_DIR, 'towns.json'), JSON.stringify(towns));
  console.log(`  Wrote towns.json (${towns.length} towns)`);

  // Build LA index
  const byLA = {};
  for (const s of schools) {
    if (!s.la || !s.laSlug) continue;
    if (!byLA[s.laSlug]) {
      byLA[s.laSlug] = { slug: s.laSlug, name: s.la, count: 0 };
    }
    byLA[s.laSlug].count++;
  }
  const las = Object.values(byLA).sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(OUT_DIR, 'las.json'), JSON.stringify(las));
  console.log(`  Wrote las.json (${las.length} LAs)`);

  // Summary stats
  const phases = {};
  for (const s of schools) phases[s.phase] = (phases[s.phase] ?? 0) + 1;
  console.log('\nPhase breakdown:', phases);
  console.log('\nDone!');
}

main().catch(console.error);
