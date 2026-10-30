// Downloads DfE (Explore Education Statistics) school-level KS4 and 16-18 destination measures
// and writes data/destinations.json, data/destinations.sql, scripts/d1-destinations.sql,
// src/data/destinations-sources.json. Run: node scripts/fetch-destinations.mjs [--no-download]
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createInterface } from 'readline';
import { parse as parseSync } from 'csv-parse/sync';

const API = 'https://api.education.gov.uk/statistics/v1/data-sets';
const KS4_ID = '019d4f41-22d1-71b2-a1a7-f3b91026815b';
const E1618_ID = '019d4e73-6440-7523-b60c-bfab1ad4a30d';
const VERSION = '2.0';
const RELEASED = '2026-10-15';
const FILES = {
  ks4: { path: 'data/dfe/ks4dest_v2.0.csv', url: `${API}/${KS4_ID}/csv?dataSetVersion=${VERSION}`, publication: 'Key stage 4 destination measures', dataset: 'Key stage 4 leavers destinations' },
  '1618': { path: 'data/dfe/dest1618_v2.0.csv', url: `${API}/${E1618_ID}/csv?dataSetVersion=${VERSION}`, publication: '16-18 destination measures', dataset: '16-18 study leavers destinations' },
};
const KEEP_COHORTS = 3;

const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null; // c, z, x, u, low, '' -> null, never 0
  return Number(s);
};
const yearKey = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;
const MAP = {
  'Sustained education, employment & apprenticeships': 'sustained',
  'Sustained education destination': 'education',
  'Further education': 'fe',
  'School sixth form': 'school_sixth_form',
  'Sixth form college': 'sixth_form_college',
  'UK higher education institution': 'he',
  'Other education destination': 'other_edu',
  'Sustained apprenticeships': 'apprenticeship',
  'Sustained employment destination': 'employment',
  'Not recorded as a sustained destination': 'not_sustained',
  'Activity not captured': 'not_captured',
};
const FIELDS = ['cohort_n', 'sustained', 'education', 'fe', 'school_sixth_form', 'sixth_form_college', 'he', 'other_edu', 'apprenticeship', 'employment', 'not_sustained', 'not_captured'];

async function download(f) {
  mkdirSync('data/dfe', { recursive: true });
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`${res.status} ${f.url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(f.path));
  if (statSync(f.path).size < 1e6) throw new Error(`suspiciously small download: ${f.path}`);
}

async function readSchool(stage, f, store, meta) {
  const rl = createInterface({ input: createReadStream(f.path), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!header) { header = parseSync(line.replace(/^﻿/, ''))[0]; continue; }
    if (!line.includes(',School,')) continue;
    const a = parseSync(line, { relax_quotes: true, relax_column_count: true })[0];
    const r = Object.fromEntries(header.map((h, i) => [h, a[i]]));
    if (r.geographic_level !== 'School') continue;
    if (r.breakdown_topic !== 'Total' || r.breakdown !== 'Total') continue;
    if (r.sex !== 'Total' || r.disadvantage_status !== 'Total' || r.ethnicity_major !== 'Total') continue;
    if (stage === '1618' && (r.cohort_level_group !== 'Total' || r.cohort_level !== 'Total')) continue;
    const field = MAP[r.destination_description];
    if (!field) continue;
    const y = yearKey(r.time_period);
    const slot = ((store[r.school_urn] ??= {})[y] ??= Object.fromEntries(FIELDS.map((k) => [k, null])));
    slot[field] = num(r.pupil_percent);
    slot.cohort_n = num(r.cohort_count);
    meta[y] ??= r.version;
  }
}

async function main() {
  const skip = process.argv.includes('--no-download');
  for (const f of Object.values(FILES)) if (!skip || !existsSync(f.path)) await download(f);
  const dl = (f) => statSync(f.path).mtime.toISOString().slice(0, 10);

  const raw = { ks4: {}, '1618': {} };
  const meta = { ks4: {}, '1618': {} };
  for (const st of ['ks4', '1618']) await readSchool(st, FILES[st], raw[st], meta[st]);

  const keep = {};
  for (const st of ['ks4', '1618']) keep[st] = Object.keys(meta[st]).sort().slice(-KEEP_COHORTS);

  // out[urn][cohort][stage] = record
  const out = {};
  const rows = [];
  for (const st of ['ks4', '1618']) {
    for (const urn in raw[st]) for (const y of keep[st]) {
      const o = raw[st][urn][y];
      if (!o || Object.values(o).every((v) => v === null)) continue;
      const end = Number(y.slice(0, 4)) + 1;
      const rec = { ...o, dest_year: `${end}/${String(end + 1).slice(2)}`, pub_year: end + 1, status: meta[st][y] };
      ((out[urn] ??= {})[y] ??= {})[st] = rec;
      rows.push({ urn, cohort: y, stage: st, ...rec });
    }
  }
  const sorted = {};
  for (const u of Object.keys(out).sort()) sorted[u] = out[u];
  writeFileSync('data/destinations.json', JSON.stringify(sorted));

  const cols = ['urn', 'cohort', 'stage', 'dest_year', 'pub_year', 'status', ...FIELDS];
  const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  rows.sort((a, b) => (a.urn + a.stage + a.cohort).localeCompare(b.urn + b.stage + b.cohort));
  const tuples = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(',')})`);
  const sql = [];
  for (let i = 0; i < tuples.length; i += 25) sql.push(`INSERT OR REPLACE INTO destinations (${cols.join(',')}) VALUES\n${tuples.slice(i, i + 25).join(',\n')};`);
  writeFileSync('data/destinations.sql', sql.join('\n') + '\n');
  writeFileSync('scripts/d1-destinations.sql',
    "CREATE TABLE IF NOT EXISTS destinations (urn TEXT NOT NULL, cohort TEXT NOT NULL, stage TEXT NOT NULL CHECK (stage IN ('ks4','1618')), dest_year TEXT, pub_year INTEGER, status TEXT, " +
    'cohort_n INTEGER, sustained REAL, education REAL, fe REAL, school_sixth_form REAL, sixth_form_college REAL, he REAL, other_edu REAL, apprenticeship REAL, employment REAL, not_sustained REAL, not_captured REAL, PRIMARY KEY (urn, cohort, stage));\n' +
    'CREATE INDEX IF NOT EXISTS idx_dest_urn ON destinations(urn);\n');

  const src = { ks4: {}, '1618': {} };
  for (const st of ['ks4', '1618']) for (const y of keep[st]) {
    const f = FILES[st];
    const end = Number(y.slice(0, 4)) + 1;
    src[st][y] = {
      publication: f.publication, dataset: f.dataset, release: `${f.publication}, data set version ${VERSION} (released ${RELEASED})`, version: VERSION,
      dataStatus: meta[st][y], cohort: y, destinationYear: `${end}/${String(end + 1).slice(2)}`, firstPublishedYear: end + 1,
      url: f.url, downloaded: dl(f),
      note: st === 'ks4'
        ? 'Pupils completing KS4 in the cohort year; destinations measured the following academic year. All pupils (no sex/disadvantage/ethnicity split). Percentages are of the cohort; null = suppressed or not applicable. fe + school_sixth_form + sixth_form_college + other_edu = education.'
        : 'Students completing 16-18 study (all qualification levels) in the cohort year; destinations measured the following academic year. Only "UK higher education institution" is published for HE at school level (no Russell Group / top-third split). null = suppressed or not applicable.',
    };
  }
  writeFileSync('src/data/destinations-sources.json', JSON.stringify(src, null, 2) + '\n');

  const cov = {};
  for (const r of rows) {
    const k = `${r.stage} ${r.cohort}`;
    cov[k] ??= { rows: 0 };
    cov[k].rows++;
    for (const c of FIELDS) if (r[c] !== null) cov[k][c] = (cov[k][c] || 0) + 1;
  }
  console.log('URNs', Object.keys(sorted).length, 'rows', rows.length);
  console.log(JSON.stringify(cov, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
