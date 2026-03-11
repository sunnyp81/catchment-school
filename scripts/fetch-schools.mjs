/**
 * Fetches school data from the Get Information About Schools (GIAS) API
 * and generates static JSON files for Astro to consume at build time.
 *
 * Run: node scripts/fetch-schools.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/data');
mkdirSync(OUT_DIR, { recursive: true });

// GIAS API — free, no auth required
const GIAS_API = 'https://ea-edubase-api-prod.azurewebsites.net/edubase/v1/establishments';

// Phase types we care about (primary + secondary)
const PHASE_MAP = {
  2: 'Primary',
  3: 'Middle',
  4: 'Secondary',
  5: 'All through',
  6: 'Nursery',
};

const OFSTED_MAP = {
  1: 'Outstanding',
  2: 'Good',
  3: 'Requires Improvement',
  4: 'Inadequate',
};

const STATUS_OPEN = 1; // EstablishmentStatus: 1 = Open

async function fetchPage(skip = 0, top = 500) {
  const url = `${GIAS_API}?$filter=StatusCode eq ${STATUS_OPEN}&$skip=${skip}&$top=${top}&$select=URN,EstablishmentName,TypeOfEstablishment/code,PhaseOfEducation/code,OfstedRating/code,Postcode,Town,AdministrativeDistrict/name,LA/name,NumberOfPupils,SchoolCapacity,Latitude,Longitude,Street,Locality,SchoolWebsite,AdmissionsPolicy/code`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIAS API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function eastingNorthingToLatLng(easting, northing) {
  // Rough conversion — GIAS provides lat/lng directly so this is a fallback
  return null;
}

async function main() {
  console.log('Fetching schools from GIAS API...');

  let allSchools = [];
  let skip = 0;
  const pageSize = 500;

  while (true) {
    console.log(`  Fetching records ${skip}–${skip + pageSize}...`);
    let data;
    try {
      data = await fetchPage(skip, pageSize);
    } catch (e) {
      console.error('Fetch failed:', e.message);
      break;
    }

    const records = data?.value ?? [];
    if (records.length === 0) break;

    allSchools.push(...records);
    skip += pageSize;

    if (records.length < pageSize) break;
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Fetched ${allSchools.length} schools.`);

  // Normalise
  const schools = allSchools
    .filter(s => s.Latitude && s.Longitude)
    .map(s => ({
      urn: s.URN,
      slug: slugify(s.EstablishmentName + '-' + s.URN),
      name: s.EstablishmentName,
      phase: PHASE_MAP[s['PhaseOfEducation/code']] ?? 'Other',
      ofsted: OFSTED_MAP[s['OfstedRating/code']] ?? null,
      ofstedCode: s['OfstedRating/code'] ?? null,
      postcode: s.Postcode ?? '',
      town: s.Town ?? '',
      la: s['LA/name'] ?? '',
      laSlug: slugify(s['LA/name'] ?? ''),
      townSlug: slugify(s.Town ?? ''),
      street: s.Street ?? '',
      pupils: s.NumberOfPupils ?? null,
      capacity: s.SchoolCapacity ?? null,
      lat: parseFloat(s.Latitude),
      lng: parseFloat(s.Longitude),
      website: s.SchoolWebsite ?? null,
    }))
    .filter(s => s.lat && s.lng);

  // Write all schools
  writeFileSync(join(OUT_DIR, 'schools.json'), JSON.stringify(schools, null, 2));
  console.log(`Wrote ${schools.length} schools to src/data/schools.json`);

  // Build area index (by town)
  const byTown = {};
  for (const s of schools) {
    if (!s.town) continue;
    if (!byTown[s.townSlug]) byTown[s.townSlug] = { slug: s.townSlug, name: s.town, la: s.la, laSlug: s.laSlug, schools: [] };
    byTown[s.townSlug].schools.push(s.urn);
  }
  const towns = Object.values(byTown).filter(t => t.schools.length >= 2);
  writeFileSync(join(OUT_DIR, 'towns.json'), JSON.stringify(towns, null, 2));
  console.log(`Wrote ${towns.length} towns to src/data/towns.json`);

  // Build LA index
  const byLA = {};
  for (const s of schools) {
    if (!s.la) continue;
    if (!byLA[s.laSlug]) byLA[s.laSlug] = { slug: s.laSlug, name: s.la, schools: [] };
    byLA[s.laSlug].schools.push(s.urn);
  }
  const las = Object.values(byLA);
  writeFileSync(join(OUT_DIR, 'las.json'), JSON.stringify(las, null, 2));
  console.log(`Wrote ${las.length} LAs to src/data/las.json`);

  console.log('Done!');
}

main().catch(console.error);
