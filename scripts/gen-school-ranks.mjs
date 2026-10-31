// Builds data/school-ranks.sql (rows for D1 table school_ranks) from the committed data/*.json files. Offline.
// Run: node scripts/gen-school-ranks.mjs   then load scripts/d1-school-ranks.sql followed by data/school-ranks.sql.
// Competition ranking: ties share a rank and the next rank skips (1, 2, 2, 4). Rank 1 is the highest value, or the lowest where dir is 'asc'.
import { readFileSync, writeFileSync } from 'fs';

const rd = (f) => JSON.parse(readFileSync(f, 'utf8'));
const schools = rd('src/data/schools.json');
const adm = rd('data/admissions.json'), perf = rd('data/performance.json'), dest = rd('data/destinations.json'), facts = rd('data/schoolfacts.json');
const perfSrc = rd('src/data/performance-sources.json');
const byUrn = new Map(schools.map((s) => [String(s.urn), s]));

const MIN_OFFERS = 30, MIN_LA = 10, MIN_POOL = 30, MIN_COHORT = 10, MIN_YEAR_N = 1000;
// Phase group from age range, because schools.json phase mislabels some all-through academies as Special. Special schools, PRUs, AP, hospital and nursery schools are not ranked.
const groupOf = (urn) => {
  const s = byUrn.get(urn); if (!s) return null;
  if (s.phase === 'Nursery' || /special|pupil referral|alternative provision|hospital/i.test(String(s.type ?? ''))) return null;
  const m = /(\d+)\D+(\d+)/.exec(String(s.ageRange ?? '')); if (!m) return null;
  const lo = +m[1], hi = +m[2];
  if (lo <= 7 && hi >= 13) return 'all-through';
  if (hi <= 12) return 'primary';
  if (lo >= 8) return 'secondary';
  return null;
};
const rnd = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// candidates: metric -> [{urn, value, year, pool}]
const cand = {};
const add = (metric, urn, value, year, pool) => { if (value == null || !Number.isFinite(value)) return; (cand[metric] ??= []).push({ urn, value, year, pool }); };

// 1. First preferences per offer, latest offer-day year. Same qualifying rules as gen-oversubscription.mjs.
const ADM_YEAR = '2026-27';
for (const [urn, years] of Object.entries(adm)) {
  for (const entry of ['7', 'R']) {
    const r = years[ADM_YEAR]?.[entry];
    if (!r || r.offers_total == null || r.offers_total < MIN_OFFERS || r.first_pref == null || r.first_pref_per_offer == null) continue;
    if (entry === '7' && groupOf(urn) === 'all-through') continue; // Year 7 offers at all-through schools leave out pupils moving up from the school's own primary
    add(entry === '7' ? 'fppo_y7' : 'fppo_r', urn, r.first_pref_per_offer, ADM_YEAR, entry === '7' ? 'year7' : 'reception');
  }
}

// 2. Performance: one year per metric, the latest with at least MIN_YEAR_N schools.
const perfYearCount = {};
const perfKeys = { a8: 'a8', p8: 'p8', abs_overall: 'abs_overall', abs_persistent: 'abs_persistent' };
for (const years of Object.values(perf)) for (const [y, r] of Object.entries(years)) for (const k of Object.keys(perfKeys)) if (r[k] != null) { perfYearCount[k] ??= {}; perfYearCount[k][y] = (perfYearCount[k][y] ?? 0) + 1; }
const perfYear = {};
for (const k of Object.keys(perfKeys)) perfYear[k] = Object.entries(perfYearCount[k]).filter(([, n]) => n >= MIN_YEAR_N).map(([y]) => y).sort().pop();
for (const [urn, years] of Object.entries(perf)) {
  const g = groupOf(urn); if (!g) continue;
  for (const k of Object.keys(perfKeys)) {
    const y = perfYear[k], r = years[y]; if (!r || r[k] == null) continue;
    if ((k === 'a8' || k === 'p8') && (r.ks4_cohort == null || r.ks4_cohort < MIN_COHORT)) continue;
    add(k, urn, k === 'p8' ? rnd(r[k], 2) : rnd(r[k], 1), y + (perfSrc.ks4?.[y]?.dataStatus === 'Provisional' && (k === 'a8' || k === 'p8') ? ' (provisional)' : ''), g);
  }
}

// 3. Destinations: sustained %, latest cohort with at least MIN_YEAR_N schools per stage.
for (const stage of ['ks4', '1618']) {
  const cnt = {};
  for (const years of Object.values(dest)) for (const [c, st] of Object.entries(years)) if (st[stage]?.sustained != null) cnt[c] = (cnt[c] ?? 0) + 1;
  const cohort = Object.entries(cnt).filter(([, n]) => n >= MIN_YEAR_N).map(([c]) => c).sort().pop();
  for (const [urn, years] of Object.entries(dest)) {
    const g = groupOf(urn); const r = years[cohort]?.[stage]; if (!g || !r || r.sustained == null || r.cohort_n == null || r.cohort_n < MIN_COHORT) continue;
    add(`dest_${stage}`, urn, rnd(r.sustained, 1), cohort + (r.status === 'Provisional' ? ' (provisional)' : ''), g);
  }
}

// 4. Pupil-teacher ratio and spending per pupil (same display rules as schooldata.ts: workforce ptr > 0, spend GBP 3,000 to 30,000).
for (const [urn, f] of Object.entries(facts)) {
  const g = groupOf(urn); if (!g) continue;
  if (f.workforce?.ptr > 0) add('ptr', urn, rnd(f.workforce.ptr, 1), f.workforce.year, g);
  const fin = f.finance;
  if (fin?.total_exp_per_pupil >= 3000 && fin.total_exp_per_pupil <= 30000 && (fin.source === 'CFR' || fin.source === 'AAR')) add(`spend_${fin.source.toLowerCase()}`, urn, fin.total_exp_per_pupil, fin.year, g);
}

// Rank within pool (national) and within pool + council.
const ASC = new Set(['abs_overall', 'abs_persistent', 'ptr']);
const rankAll = (list, asc) => {
  const sorted = [...list].sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
  const rankOf = new Map(); let r = 1;
  sorted.forEach((x, i) => { if (i > 0 && sorted[i - 1].value !== x.value) r = i + 1; rankOf.set(x, r); });
  return rankOf;
};
const rows = []; const summary = {};
for (const [metric, list] of Object.entries(cand)) {
  const asc = ASC.has(metric);
  const pools = {}; for (const c of list) (pools[`${c.pool}|${c.year}`] ??= []).push(c);
  for (const [key, pl] of Object.entries(pools)) {
    const nat = rankAll(pl, asc);
    if (pl.length < MIN_POOL) continue;
    const las = {}; for (const c of pl) (las[byUrn.get(c.urn)?.laSlug ?? ''] ??= []).push(c);
    const laRank = new Map(); for (const [slug, ll] of Object.entries(las)) if (slug && ll.length >= MIN_LA) { const m = rankAll(ll, asc); for (const [c, r] of m) laRank.set(c, [r, ll.length]); }
    for (const c of pl) {
      if (!byUrn.has(c.urn)) continue; // no school page
      const la = laRank.get(c);
      rows.push([c.urn, metric, c.value, nat.get(c), pl.length, la?.[0] ?? null, la?.[1] ?? null, c.year, c.pool]);
    }
    (summary[metric] ??= []).push(`${key} n=${pl.length}`);
  }
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));

const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const COLS = 'urn,metric,value,rank,of_n,la_rank,la_of_n,year,pool';
const out = ['DELETE FROM school_ranks;'];
for (let i = 0; i < rows.length; i += 50) out.push(`INSERT INTO school_ranks (${COLS}) VALUES\n${rows.slice(i, i + 50).map((r) => `(${r.map(q).join(',')})`).join(',\n')};`);
writeFileSync('data/school-ranks.sql', out.join('\n') + '\n');
console.log('rows', rows.length, 'schools', new Set(rows.map((r) => r[0])).size);
for (const [m, v] of Object.entries(summary)) console.log(m, v.join('; '));
