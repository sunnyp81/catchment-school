// Downloads DfE (Explore Education Statistics) school-level KS4, 16-18 and absence data
// and writes data/performance.json, data/performance.sql, scripts/d1-performance.sql,
// src/data/performance-sources.json. Run: node scripts/fetch-performance.mjs [--no-download]
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { parse } from 'csv-parse';

const API = 'https://api.education.gov.uk/statistics/v1/data-sets';
const CMS = 'https://content.explore-education-statistics.service.gov.uk/api/data-set-files';
const KS4_ID = '19e39901-a96c-be76-b9c2-6af54ae076d2';
const AL_ID = '019c2960-81e3-70c2-8d65-72c3718ae4fd';
const ABS_FILE_ID = '889f9166-e3bf-4d3a-afb2-d86e4aecc70a';

const FILES = {
  ks4_new: { path: 'data/dfe/ks4_v2.0.1.csv', url: `${API}/${KS4_ID}/csv?dataSetVersion=2.0.1` },
  ks4_old: { path: 'data/dfe/ks4_v1.0.3.csv', url: `${API}/${KS4_ID}/csv?dataSetVersion=1.0.3` },
  alevel: { path: 'data/dfe/alevel_v1.0.3.csv', url: `${API}/${AL_ID}/csv?dataSetVersion=1.0.3` },
  absence: { path: 'data/dfe/absence_2024-25_school.csv', url: `${CMS}/${ABS_FILE_ID}/download` },
};

const ABS_YEARS = new Set(['201819', '202122', '202223', '202324', '202425']);
const yearKey = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;
const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null; // z, c, u, x, NE, SUPP, NP, '' -> null
  return Number(s);
};
const grade = (v) => (v && /^[A-E][+-]?$/.test(v.trim()) ? v.trim() : null);

async function download(f) {
  mkdirSync('data/dfe', { recursive: true });
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`${res.status} ${f.url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(f.path));
  if (statSync(f.path).size < 10000) throw new Error(`suspiciously small download: ${f.path}`);
}

async function rows(path, onRow) {
  const p = createReadStream(path).pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true, bom: true }));
  for await (const r of p) onRow(r);
}

const perf = {};
const slot = (urn, y) => ((perf[urn] ??= {})[y] ??= {
  a8: null, p8: null, p8_lower: null, p8_upper: null, em5: null, em4: null, ks4_cohort: null,
  alevel_aps: null, alevel_grade: null, alevel_entries: null, abs_overall: null, abs_persistent: null,
});
const ks4Urns = new Set();
const alUrns = new Set();
const srcYears = { ks4: {}, alevel: {}, absence: {} };
const seen = new Set();

async function loadKs4(file, label) {
  await rows(file.path, (r) => {
    if (r.breakdown_topic !== 'Total' || r.breakdown !== 'Total') return;
    const y = yearKey(r.time_period);
    const k = `${r.school_urn}|${y}`;
    if (seen.has(k)) return; // newer file is loaded first and wins
    seen.add(k);
    const o = slot(r.school_urn, y);
    o.a8 = num(r.attainment8_average);
    o.p8 = num(r.progress8_average);
    o.p8_lower = num(r.progress8_lower_95_ci);
    o.p8_upper = num(r.progress8_upper_95_ci);
    o.em5 = num(r.engmath_95_percent);
    o.em4 = num(r.engmath_94_percent);
    o.ks4_cohort = num(r.pupil_count);
    ks4Urns.add(r.school_urn);
    srcYears.ks4[y] ??= { file: label, status: r.version };
  });
}

async function main() {
  const skip = process.argv.includes('--no-download');
  for (const f of Object.values(FILES)) if (!skip || !existsSync(f.path)) await download(f);
  const dl = (f) => statSync(f.path).mtime.toISOString().slice(0, 10);

  await loadKs4(FILES.ks4_new, 'new');
  await loadKs4(FILES.ks4_old, 'old');

  await rows(FILES.alevel.path, (r) => {
    if (r.exam_cohort !== 'A level' || r.disadvantage_status !== 'Total') return;
    const y = yearKey(r.time_period);
    const k = `al|${r.school_urn}|${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    const o = slot(r.school_urn, y);
    o.alevel_aps = num(r.aps_per_entry);
    o.alevel_grade = grade(r.aps_per_entry_grade);
    o.alevel_entries = num(r.aps_per_entry_student_count); // students in APS measure; entry counts not published
    alUrns.add(r.school_urn);
    srcYears.alevel[y] ??= { status: r.version };
  });

  const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
  const secondaryLike = new Set(schools.filter((s) => ['Secondary', 'All through', 'Middle deemed secondary'].includes(s.phase)).map((s) => s.urn));
  await rows(FILES.absence.path, (r) => {
    if (!ABS_YEARS.has(r.time_period)) return;
    const u = r.school_urn;
    if (!(ks4Urns.has(u) || alUrns.has(u) || secondaryLike.has(u))) return;
    const y = yearKey(r.time_period);
    const k = `abs|${u}|${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    const o = slot(u, y);
    o.abs_overall = num(r.sess_overall_percent);
    o.abs_persistent = num(r.enrolments_pa_10_exact_percent);
    srcYears.absence[y] ??= {};
  });

  const sorted = {};
  for (const urn of Object.keys(perf).sort()) {
    const ys = {};
    for (const y of Object.keys(perf[urn]).sort()) if (Object.values(perf[urn][y]).some((v) => v !== null)) ys[y] = perf[urn][y];
    if (Object.keys(ys).length) sorted[urn] = ys;
  }
  writeFileSync('data/performance.json', JSON.stringify(sorted));

  const cols = ['urn', 'year', 'a8', 'p8', 'p8_lower', 'p8_upper', 'em5', 'em4', 'ks4_cohort', 'alevel_aps', 'alevel_grade', 'alevel_entries', 'abs_overall', 'abs_persistent'];
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const tuples = [];
  for (const urn in sorted) for (const y in sorted[urn]) tuples.push(`(${cols.map((c) => lit(c === 'urn' ? urn : c === 'year' ? y : sorted[urn][y][c])).join(',')})`);
  const out = [];
  for (let i = 0; i < tuples.length; i += 25) out.push(`INSERT OR REPLACE INTO performance (${cols.join(',')}) VALUES\n${tuples.slice(i, i + 25).join(',\n')};`);
  writeFileSync('data/performance.sql', out.join('\n') + '\n');
  writeFileSync('scripts/d1-performance.sql',
    'CREATE TABLE IF NOT EXISTS performance (urn TEXT NOT NULL, year TEXT NOT NULL, a8 REAL, p8 REAL, p8_lower REAL, p8_upper REAL, em5 REAL, em4 REAL, ks4_cohort INTEGER, alevel_aps REAL, alevel_grade TEXT, alevel_entries INTEGER, abs_overall REAL, abs_persistent REAL, PRIMARY KEY (urn, year));\n' +
    'CREATE INDEX IF NOT EXISTS idx_perf_urn ON performance(urn);\n');

  const ks4Meta = {
    new: { release: 'Key stage 4 performance, Academic year 2025/26', version: '2.0.1', dataset: 'Key stage 4 institution level - Performance (API data set "Performance tables schools data", 2023/24 to 2025/26)', file: FILES.ks4_new },
    old: { release: 'Key stage 4 performance, Academic year 2024/25', version: '1.0.3', dataset: 'Key stage 4 institution level - Schools (performance) (API data set "Performance tables schools data", 2022/23 to 2024/25)', file: FILES.ks4_old },
  };
  const src = { ks4: {}, alevel: {}, absence: {} };
  for (const y of Object.keys(srcYears.ks4).sort()) {
    const m = ks4Meta[srcYears.ks4[y].file];
    src.ks4[y] = { publication: 'Key stage 4 performance', dataset: m.dataset, release: m.release, version: m.version, dataStatus: srcYears.ks4[y].status, url: m.file.url, downloaded: dl(m.file) };
    if (y >= '2024-25') src.ks4[y].note = 'Progress 8 not published for this cohort (no KS2 baseline); stored as null';
  }
  for (const y of Object.keys(srcYears.alevel).sort())
    src.alevel[y] = { publication: '16 to 19 performance', dataset: 'Schools and colleges - performance (A level cohort, all students)', release: 'Academic year 2024/25', version: '1.0.3', dataStatus: srcYears.alevel[y].status, url: FILES.alevel.url, downloaded: dl(FILES.alevel), note: 'alevel_entries = number of students in the APS measure (school-level entry counts are not published)' };
  for (const y of Object.keys(srcYears.absence).sort())
    src.absence[y] = { publication: 'Pupil absence in schools in England', dataset: 'Absence rates by school level (1a_Absence_3term_school.csv)', release: 'Academic year 2024/25 (published 2026-03-26)', version: 'n/a', url: FILES.absence.url, downloaded: dl(FILES.absence), note: 'abs_persistent = % of enrolments persistently absent (10% or more sessions missed)' };
  writeFileSync('src/data/performance-sources.json', JSON.stringify(src, null, 2) + '\n');

  const cov = {};
  for (const urn in sorted) for (const y in sorted[urn]) for (const c of cols.slice(2)) if (sorted[urn][y][c] !== null) { cov[y] ??= {}; cov[y][c] = (cov[y][c] || 0) + 1; }
  console.log('URNs', Object.keys(sorted).length, 'rows', tuples.length);
  console.log(JSON.stringify(cov, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
