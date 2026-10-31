// School-level applications and offers (DfE "Primary and secondary school applications and offers").
// The school-level file is a SUPPORTING FILE (not an API data set) inside the release ZIP, keyed by school_urn.
// Writes data/admissions.json, data/admissions.sql, scripts/d1-admissions.sql, src/data/admissions-sources.json.
// Run: node scripts/fetch-admissions.mjs [--no-download]
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { execFileSync } from 'child_process';
import { parse } from 'csv-parse';

const RELEASE_ID = '0bf4f9cf-721d-44e3-8473-266c87e17e00'; // Academic year 2026/27, published 2026-06-18, school file updated 2026-06-29
const ZIP_URL = `https://content.explore-education-statistics.service.gov.uk/api/releases/${RELEASE_ID}/files`;
const DIR = 'data/dfe/adm';
const ZIP = `${DIR}/r2026.zip`;
const CSV_IN_ZIP = 'supporting-files/AppsandOffers_2026_SchoolLevel29062026.csv';
const CSV = `${DIR}/${CSV_IN_ZIP}`;
const YEARS = ['202425', '202526', '202627']; // offer-day year = September entry year; 202627 = Sept 2026 entry
const ENTRY = new Set(['7', 'R', '9']); // Y7 secondary, Reception primary, Y9 (Central Bedfordshire only, to 2025/26)

const num = (v) => {
  const s = String(v ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null; // z, c, n/a, '' -> null
};
const yearKey = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;
const r4 = (n) => (n === null ? null : Math.round(n * 10000) / 10000);

async function main() {
  mkdirSync(DIR, { recursive: true });
  if (!process.argv.includes('--no-download') || !existsSync(ZIP)) {
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error(`${res.status} ${ZIP_URL}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(ZIP));
    if (statSync(ZIP).size < 1e6) throw new Error('suspiciously small ZIP');
  }
  if (!existsSync(CSV)) execFileSync('tar', ['-xf', ZIP, '-C', DIR, CSV_IN_ZIP]); // bsdtar reads zip on Windows/macOS
  const downloaded = statSync(ZIP).mtime.toISOString().slice(0, 10);

  const out = {};
  const seen = new Set();
  const skipped = { dummy_code_no_urn: 0, dup: 0 };
  const p = createReadStream(CSV).pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true, bom: true }));
  for await (const r of p) {
    if (!YEARS.includes(r.time_period) || !ENTRY.has(r.entry_year)) continue;
    if (!/^\d+$/.test(r.school_urn)) { skipped.dummy_code_no_urn++; continue; } // dummy establishment codes (split sites, streams) have school_urn 'n/a'
    const k = `${r.school_urn}|${r.time_period}|${r.entry_year}`;
    const first = num(r.times_put_as_1st_preference);
    const fpo = num(r.number_1st_preference_offers);
    const o = {
      offers_total: num(r.total_number_places_offered),
      preferred_offers: num(r.number_preferred_offers),
      first_pref_offers: fpo,
      second_pref_offers: num(r.number_2nd_preference_offers),
      third_pref_offers: num(r.number_3rd_preference_offers),
      prefs_total: num(r.times_put_as_any_preferred_school),
      first_pref: first,
      second_pref: num(r.times_put_as_2nd_preference),
      third_pref: num(r.times_put_as_3rd_preference),
      first_pref_per_offer: r4(num(r.proportion_1stprefs_v_totaloffers)),
      pct_first_pref_offered: first && fpo !== null ? Math.round((fpo / first) * 1000) / 10 : null,
      apps_other_la: num(r.all_applications_from_another_LA),
      offers_other_la: num(r.offers_to_applicants_from_another_LA),
    };
    const slot = ((out[r.school_urn] ??= {})[yearKey(r.time_period)] ??= {});
    const prev = slot[r.entry_year];
    if (seen.has(k) && prev) {
      // Split sites and streams sharing one URN: sum the counts into a school total, then recompute the ratios.
      skipped.dup++;
      const add = (a, b) => (a === null || b === null ? null : a + b);
      for (const f of ['offers_total', 'preferred_offers', 'first_pref_offers', 'second_pref_offers', 'third_pref_offers', 'prefs_total', 'first_pref', 'second_pref', 'third_pref', 'apps_other_la', 'offers_other_la']) prev[f] = add(prev[f], o[f]);
      prev.first_pref_per_offer = prev.first_pref !== null && prev.offers_total ? r4(prev.first_pref / prev.offers_total) : null;
      prev.pct_first_pref_offered = prev.first_pref && prev.first_pref_offers !== null ? Math.round((prev.first_pref_offers / prev.first_pref) * 1000) / 10 : null;
      continue;
    }
    seen.add(k);
    slot[r.entry_year] = o;
  }

  const sorted = {};
  for (const u of Object.keys(out).sort()) sorted[u] = out[u];
  writeFileSync('data/admissions.json', JSON.stringify(sorted));

  const cols = ['urn', 'year', 'entry', 'offers_total', 'preferred_offers', 'first_pref_offers', 'second_pref_offers', 'third_pref_offers', 'prefs_total', 'first_pref', 'second_pref', 'third_pref', 'first_pref_per_offer', 'pct_first_pref_offered', 'apps_other_la', 'offers_other_la'];
  const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const tuples = [];
  for (const u in sorted) for (const y in sorted[u]) for (const e in sorted[u][y])
    tuples.push(`(${cols.map((c) => lit(c === 'urn' ? u : c === 'year' ? y : c === 'entry' ? e : sorted[u][y][e][c])).join(',')})`);
  const sql = [];
  for (let i = 0; i < tuples.length; i += 25) sql.push(`INSERT OR REPLACE INTO admissions (${cols.join(',')}) VALUES\n${tuples.slice(i, i + 25).join(',\n')};`);
  writeFileSync('data/admissions.sql', sql.join('\n') + '\n');
  writeFileSync('scripts/d1-admissions.sql',
    'CREATE TABLE IF NOT EXISTS admissions (urn TEXT NOT NULL, year TEXT NOT NULL, entry TEXT NOT NULL, offers_total INTEGER, preferred_offers INTEGER, first_pref_offers INTEGER, second_pref_offers INTEGER, third_pref_offers INTEGER, prefs_total INTEGER, first_pref INTEGER, second_pref INTEGER, third_pref INTEGER, first_pref_per_offer REAL, pct_first_pref_offered REAL, apps_other_la INTEGER, offers_other_la INTEGER, PRIMARY KEY (urn, year, entry));\n' +
    'CREATE INDEX IF NOT EXISTS idx_adm_urn ON admissions(urn);\n');

  const src = {};
  for (const y of YEARS) {
    src[yearKey(y)] = {
      publication: 'Primary and secondary school applications and offers',
      release: 'Academic year 2026/27 (published 2026-06-18; school-level file dated 2026-06-29)',
      file: 'supporting-files/AppsandOffers_2026_SchoolLevel29062026.csv (supporting file, not an API data set; contains the full 2014/15-2026/27 time series)',
      url: ZIP_URL,
      page: 'https://explore-education-statistics.service.gov.uk/find-statistics/primary-and-secondary-school-applications-and-offers/2026-27',
      methodology: 'https://explore-education-statistics.service.gov.uk/methodology/secondary-and-primary-school-applications-and-offers-methodology',
      downloaded,
      note: y === '202627' ? 'offers made on national offer day for September 2026 entry (secondary 2 March 2026, primary 16 April 2026)' : 'offers made on national offer day for September ' + y.slice(0, 4) + ' entry',
    };
  }
  writeFileSync('src/data/admissions-sources.json', JSON.stringify(src, null, 2) + '\n');

  const cnt = {};
  for (const u in sorted) for (const y in sorted[u]) for (const e in sorted[u][y]) { const k = `${y}|${e}`; cnt[k] = (cnt[k] || 0) + 1; }
  console.log('URNs', Object.keys(sorted).length, 'rows', tuples.length, 'skipped', skipped);
  console.log(cnt);
}
main().catch((e) => { console.error(e); process.exit(1); });
