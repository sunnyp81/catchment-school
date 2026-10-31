// Builds src/data/oversubscription.json, src/data/oversubscription-index.json and
// public/downloads/oversubscribed-schools-2026.csv from the RAW DfE school-level and local-authority CSVs.
// Offline. The raw files are gitignored (data/dfe/), so run this by hand after fetch-admissions.mjs and commit the outputs.
// Run: node scripts/gen-oversubscription.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse/sync';

const S1_FILE = 'data/dfe/adm/supporting-files/AppsandOffers_2026_SchoolLevel29062026.csv';
const S2_FILE = 'data/dfe/adm/data/AppsandOffers2026_LA_19052026.csv';
const YEARS = ['202425', '202526', '202627'];
const yl = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;
const MIN_OFFERS = 30;
const MIN_SCHOOLS = { '7': 8, R: 10 };
const MIN_COUNCIL_APPS = 100; // keeps City of London (23 applicants) out of council rankings
const TOP = { '7': 100, R: 50 };

const rd = (f) => parse(readFileSync(f), { columns: true, bom: true, relax_quotes: true, skip_empty_lines: true });
const num = (v) => { const s = String(v ?? '').trim(); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null; };
const r4 = (n) => (n === null ? null : Math.round(n * 10000) / 10000);
const r1 = (n) => Math.round(n * 10) / 10;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const deDash = (s) => String(s ?? '').replace(/[‒–—―−]/g, '-');
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
const las = JSON.parse(readFileSync('src/data/las.json', 'utf8'));
const byUrn = new Map(schools.map((s) => [String(s.urn), s]));
const laByNorm = new Map(las.map((l) => [norm(l.name), l]));
const laBySlug = new Map(las.map((l) => [l.slug, l]));
const laAlias = new Map([['bristol city of', 'bristol-city-of'], ['st helens', 'st-helens']]);
const laFromName = (n) => laByNorm.get(norm(n)) ?? (laAlias.has(norm(n)) ? laBySlug.get(laAlias.get(norm(n))) : null);

// ---------- S1: school-level, summing split-site rows that share a URN (same rule as fetch-admissions.mjs) ----------
const SUM = ['offers_total', 'first_pref_offers', 'first_pref', 'apps_other_la', 'offers_other_la'];
const rows = new Map(); // key urn|year|entry -> record
let dupSummed = 0, dummyUrn = 0;
for (const r of rd(S1_FILE)) {
  if (!YEARS.includes(r.time_period) || !['7', 'R'].includes(r.entry_year)) continue;
  if (!/^\d+$/.test(r.school_urn)) { dummyUrn++; continue; }
  const o = {
    urn: r.school_urn, year: r.time_period, entry: r.entry_year,
    offers_total: num(r.total_number_places_offered), first_pref_offers: num(r.number_1st_preference_offers),
    first_pref: num(r.times_put_as_1st_preference), apps_other_la: num(r.all_applications_from_another_LA),
    offers_other_la: num(r.offers_to_applicants_from_another_LA), fppo: r4(num(r.proportion_1stprefs_v_totaloffers)),
    la_name: r.la_name, dfe_name: deDash(r.school_name), allthrough: r.allthrough_school === 'Yes',
    selective: r.admissions_policy === 'Selective', faith: r.denomination === 'Faith',
  };
  const k = `${o.urn}|${o.year}|${o.entry}`;
  const prev = rows.get(k);
  if (!prev) { rows.set(k, o); continue; }
  dupSummed++;
  const add = (a, b) => (a === null || b === null ? null : a + b);
  for (const f of SUM) prev[f] = add(prev[f], o[f]);
  prev.fppo = prev.first_pref !== null && prev.offers_total ? r4(prev.first_pref / prev.offers_total) : null;
  prev.allthrough ||= o.allthrough; prev.selective ||= o.selective; prev.faith ||= o.faith;
}
// A row qualifies on the national measure. Year 7 rows at all-through schools are dropped: their Year 7 offers exclude automatic progression
// from the school's own primary, so first preferences per offer is inflated. Reception rows at all-through schools are a normal intake and stay.
const qualifies = (o) => o.offers_total !== null && o.offers_total >= MIN_OFFERS && o.first_pref !== null && o.fppo !== null &&
  !(o.entry === '7' && o.allthrough);
const excludedAllThrough = [...rows.values()].filter((o) => o.year === '202627' && o.entry === '7' && o.allthrough && o.offers_total >= MIN_OFFERS).length;

// Cross-check against data/admissions.json (school pages) so both agree.
let mismatch = 0, compared = 0;
try {
  const adm = JSON.parse(readFileSync('data/admissions.json', 'utf8'));
  for (const o of rows.values()) {
    const a = adm[o.urn]?.[yl(o.year)]?.[o.entry]; if (!a) { mismatch++; continue; }
    compared++;
    if (a.first_pref !== o.first_pref || a.offers_total !== o.offers_total || a.first_pref_per_offer !== o.fppo) mismatch++;
  }
} catch { /* admissions.json optional */ }

const councilOf = (o) => {
  const s = byUrn.get(o.urn);
  if (s?.laSlug && laBySlug.has(s.laSlug)) return laBySlug.get(s.laSlug);
  return laFromName(o.la_name);
};

const byEntryYear = { '7': {}, R: {} };
for (const o of rows.values()) {
  if (!qualifies(o)) continue;
  (byEntryYear[o.entry][o.year] ??= new Map()).set(o.urn, o);
}

const mkRow = (cur, entry) => {
  const s = byUrn.get(cur.urn);
  const la = councilOf(cur);
  const series = YEARS.map((y) => {
    const p = byEntryYear[entry][y]?.get(cur.urn);
    if (p) return p.fppo;
    const any = rows.get(`${cur.urn}|${y}|${entry}`);
    return any ? 'low' : null; // 'low' = row exists but under 30 offers (or all-through), null = no row
  });
  return {
    urn: cur.urn, slug: s?.slug ?? null, name: s?.name ? deDash(s.name) : cur.dfe_name,
    council: la?.name ?? deDash(cur.la_name), councilSlug: la?.slug ?? null,
    fp: cur.first_pref, offers: cur.offers_total, fppo: cur.fppo,
    pctOffered: cur.first_pref > 0 && cur.first_pref_offers !== null ? r1((cur.first_pref_offers / cur.first_pref) * 100) : null,
    offersOtherLa: cur.offers_other_la, appsOtherLa: cur.apps_other_la,
    selective: cur.selective, faith: cur.faith, series,
  };
};
const cmp = (a, b) => b.fppo - a.fppo || b.fp - a.fp || a.name.localeCompare(b.name);
const all = { '7': [], R: [] };
for (const e of ['7', 'R']) for (const o of byEntryYear[e]['202627']?.values() ?? []) all[e].push(mkRow(o, e));
for (const e of ['7', 'R']) all[e].sort(cmp);

const stats = (list) => {
  const n = list.length;
  const fp = list.reduce((a, r) => a + r.fp, 0), of = list.reduce((a, r) => a + r.offers, 0);
  const pcts = list.map((r) => r.pctOffered).filter((x) => x !== null);
  const c = (t) => list.filter((r) => r.fppo >= t).length;
  return {
    n, median: r4(median(list.map((r) => r.fppo))), pooled: of ? r4(fp / of) : null,
    below1: list.filter((r) => r.fppo < 1).length, below1Pct: n ? r1((list.filter((r) => r.fppo < 1).length / n) * 100) : null,
    at15: c(1.5), at15Pct: n ? r1((c(1.5) / n) * 100) : null, at2: c(2), at2Pct: n ? r1((c(2) / n) * 100) : null,
    medianPctOffered: pcts.length ? r1(median(pcts)) : null,
  };
};

// ---------- S2: local-authority rows ----------
const s2 = rd(S2_FILE).filter((r) => YEARS.includes(r.time_period) && (
  (r.geographic_level === 'National' && r.nc_year_admission === 'z') ||
  (r.school_phase === 'Secondary' && r.nc_year_admission === '7') || (r.school_phase === 'Primary' && r.nc_year_admission === 'R')));
const phaseEntry = (r) => (r.school_phase === 'Secondary' ? '7' : 'R');
const nOff = (r) => { const p = num(r.first_preference_offers_percent); return p === null ? null : r1(100 - p); };
const national = { '7': {}, R: {} };
const laYear = { '7': {}, R: {} }; // slug -> year -> {notOffered, apps, noOffer}
const unmatchedLa = new Set();
for (const r of s2) {
  const e = phaseEntry(r), y = yl(r.time_period);
  if (r.geographic_level === 'National') national[e][y] = { notOfferedPct: nOff(r), applications: num(r.applications_received) };
  if (r.geographic_level === 'Local authority') {
    const la = laFromName(r.la_name);
    if (!la) { unmatchedLa.add(r.la_name); continue; }
    (laYear[e][la.slug] ??= {})[y] = { notOfferedPct: nOff(r), applications: num(r.applications_received) };
  }
}
const councilCount = Object.fromEntries(['7', 'R'].map((e) => [e, Object.keys(laYear[e]).length]));

const latest = '2026-27';
const rankCouncils = (e) => Object.entries(laYear[e])
  .filter(([, v]) => v[latest]?.notOfferedPct !== null && v[latest]?.notOfferedPct !== undefined && (v[latest].applications ?? 0) >= MIN_COUNCIL_APPS)
  .map(([slug, v]) => ({ slug, name: laBySlug.get(slug).name, pct: v[latest].notOfferedPct, prev: v['2024-25']?.notOfferedPct ?? null, apps: v[latest].applications }))
  .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
const ranked = { '7': rankCouncils('7'), R: rankCouncils('R') };

const allPct = Object.fromEntries(['7', 'R'].map((e) => [e, Object.values(laYear[e]).map((v) => v[latest]?.notOfferedPct).filter((x) => x != null)]));

// ---------- councils ----------
const councils = {};
for (const e of ['7', 'R']) {
  const bySlug = {};
  for (const r of all[e]) if (r.councilSlug) (bySlug[r.councilSlug] ??= []).push(r);
  for (const [slug, list] of Object.entries(bySlug)) {
    if (list.length < MIN_SCHOOLS[e]) continue;
    const trend = laYear[e][slug];
    if (!trend || trend[latest]?.notOfferedPct == null) continue;
    const off = list.reduce((a, r) => a + r.offers, 0), oo = list.reduce((a, r) => a + (r.offersOtherLa ?? 0), 0);
    const rk = ranked[e].findIndex((x) => x.slug === slug);
    (councils[slug] ??= {})[e === '7' ? 'secondary' : 'primary'] = {
      n: list.length, at15: list.filter((r) => r.fppo >= 1.5).length, at2: list.filter((r) => r.fppo >= 2).length,
      otherLaOfferPct: list.every((r) => r.offersOtherLa !== null) && off ? r1((oo / off) * 100) : null,
      notOffered: Object.fromEntries(YEARS.map((p) => [yl(p), trend[yl(p)]?.notOfferedPct ?? null])),
      rank: rk >= 0 ? rk + 1 : null, of: ranked[e].length,
      rows: list.map((r) => [r.slug, r.name, r.fp, r.offers, r.fppo, r.pctOffered, r.selective ? 1 : 0, r.faith ? 1 : 0]),
    };
  }
}

// ---------- national ----------
const sel7 = all['7'].filter((r) => r.selective), faith7 = all['7'].filter((r) => !r.selective && r.faith), rest7 = all['7'].filter((r) => !r.selective && !r.faith);
const faithR = all.R.filter((r) => r.faith), restR = all.R.filter((r) => !r.faith);
const trend3 = (e) => {
  const ids = [...(byEntryYear[e]['202627']?.keys() ?? [])].filter((u) => YEARS.every((y) => byEntryYear[e][y]?.has(u)));
  const d = ids.map((u) => byEntryYear[e]['202627'].get(u).fppo - byEntryYear[e]['202425'].get(u).fppo);
  return {
    n: ids.length, rose03: d.filter((x) => x >= 0.3).length, fell03: d.filter((x) => x <= -0.3).length,
    medians: YEARS.map((y) => r4(median(ids.map((u) => byEntryYear[e][y].get(u).fppo)))),
  };
};
const topList = (e) => all[e].slice(0, TOP[e]);

const out = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    source: 'Department for Education, Primary and secondary school applications and offers, academic year 2026/27 (published 2026-06-18)',
    schoolFile: 'School-level supporting file dated 2026-06-29', councilFile: 'Local-authority file dated 2026-05-19',
    publication: 'https://explore-education-statistics.service.gov.uk/find-statistics/primary-and-secondary-school-applications-and-offers/2026-27',
    methodology: 'https://explore-education-statistics.service.gov.uk/methodology/secondary-and-primary-school-applications-and-offers-methodology',
    years: YEARS.map(yl), offerDays: { '7': '2 March 2026', R: '16 April 2026' },
    minOffers: MIN_OFFERS, minSchools: MIN_SCHOOLS, minCouncilApplications: MIN_COUNCIL_APPS,
    qa: { dupSummed, dummyUrn, excludedAllThroughY7: excludedAllThrough, comparedToAdmissionsJson: compared, mismatchVsAdmissionsJson: mismatch, unmatchedLa: [...unmatchedLa] },
  },
  national: {
    secondary: { ...stats(all['7']), selective: stats(sel7), faith: stats(faith7), rest: stats(rest7), trend: trend3('7'), notOffered: Object.fromEntries(Object.entries(national['7']).map(([y, v]) => [y, v])), councils: councilCount['7'], medianCouncilPct: r1(median(allPct['7'])) },
    primary: { ...stats(all.R), faith: stats(faithR), rest: stats(restR), trend: trend3('R'), notOffered: Object.fromEntries(Object.entries(national.R).map(([y, v]) => [y, v])), councils: councilCount.R, medianCouncilPct: r1(median(allPct.R)) },
  },
  councilRank: { secondary: ranked['7'], primary: ranked.R },
  top: { secondary: topList('7'), primary: topList('R') },
  councils,
};
writeFileSync('src/data/oversubscription.json', JSON.stringify(out));
writeFileSync('src/data/oversubscription-index.json', JSON.stringify(Object.fromEntries(Object.entries(councils).map(([s, v]) => [s, [v.secondary ? 's' : '', v.primary ? 'p' : ''].join('')]))));

// ---------- CSV (national table, every qualifying school) ----------
const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const ser = (v) => (v === null ? 'Not published' : v === 'low' ? 'Under 30 offers' : v.toFixed(2));
const head = ['phase', 'entry_year', 'school_urn', 'school_name', 'council', 'selective', 'faith_school', 'first_preferences_2026_27', 'offers_2026_27', 'first_preferences_per_offer_2026_27', 'percent_first_choice_families_offered_2026_27', 'first_preferences_per_offer_2025_26', 'first_preferences_per_offer_2024_25'];
const lines = [head.join(',')];
for (const e of ['7', 'R']) for (const r of all[e]) lines.push([e === '7' ? 'Secondary' : 'Primary', e === '7' ? 'Year 7' : 'Reception', r.urn, r.name, r.council, r.selective ? 'Yes' : 'No', r.faith ? 'Yes' : 'No', r.fp, r.offers, r.fppo.toFixed(2), r.pctOffered === null ? 'Not published' : r.pctOffered.toFixed(1), ser(r.series[1]), ser(r.series[0])].map(q).join(','));
mkdirSync('public/downloads', { recursive: true });
writeFileSync('public/downloads/oversubscribed-schools-2026.csv', '﻿' + lines.join('\r\n') + '\r\n');

// ---------- headline print ----------
const S = out.national;
console.log('S1 rows summed (split sites):', dupSummed, '| dummy URN rows skipped:', dummyUrn, '| all-through Y7 excluded 2026-27:', excludedAllThrough);
console.log('Cross-check vs admissions.json: compared', compared, 'mismatch', mismatch);
console.log('Y7 qualifying n =', S.secondary.n, '(scope 3,063) | R n =', S.primary.n, '(scope 7,969)');
console.log('Median FPPO Y7', S.secondary.median, '(0.95) R', S.primary.median, '(0.98) | pooled Y7', S.secondary.pooled, '(0.998) R', S.primary.pooled, '(1.007)');
console.log('Below 1: Y7', S.secondary.below1Pct, '% (61) R', S.primary.below1Pct, '% (56) | 2+: Y7', S.secondary.at2, '(53) R', S.primary.at2, '(25) | 1.5+ Y7', S.secondary.at15, '(201)');
console.log('Not offered 1st pref Y7', JSON.stringify(Object.fromEntries(Object.entries(S.secondary.notOffered).map(([y, v]) => [y, v.notOfferedPct]))), '(16.4/16.5/17.1)');
console.log('Not offered 1st pref R', JSON.stringify(Object.fromEntries(Object.entries(S.primary.notOffered).map(([y, v]) => [y, v.notOfferedPct]))), '(7.6/7.4/6.9)');
console.log('Applications Y7', S.secondary.notOffered['2024-25']?.applications, '->', S.secondary.notOffered['2026-27']?.applications, '| R', S.primary.notOffered['2024-25']?.applications, '->', S.primary.notOffered['2026-27']?.applications);
console.log('Council median Y7', S.secondary.medianCouncilPct, '(16.1) R', S.primary.medianCouncilPct, '(7.1) | LAs', councilCount);
console.log('Y7 top council:', ranked['7'].slice(0, 5).map((x) => `${x.name} ${x.pct} (${x.prev})`).join('; '));
console.log('R top council:', ranked.R.slice(0, 5).map((x) => `${x.name} ${x.pct} (${x.prev})`).join('; '));
console.log('Y7 lowest:', ranked['7'].slice(-3).map((x) => `${x.name} ${x.pct}`).join('; '));
console.log('Trend Y7', JSON.stringify(S.secondary.trend), '(2954 / 103 / 120 / .96 .96 .95)');
console.log('Y7 selective', JSON.stringify(S.secondary.selective));
console.log('Y7 faith', JSON.stringify(S.secondary.faith));
console.log('Y7 rest', JSON.stringify(S.secondary.rest));
console.log('R faith', JSON.stringify(S.primary.faith), '\nR rest', JSON.stringify(S.primary.rest));
console.log('Top Y7:', out.top.secondary.slice(0, 5).map((r) => `${r.name} ${r.fp}/${r.offers}=${r.fppo.toFixed(2)}`).join('; '));
console.log('Top R:', out.top.primary.slice(0, 5).map((r) => `${r.name} ${r.fp}/${r.offers}=${r.fppo.toFixed(2)}`).join('; '));
const cs = Object.values(councils);
console.log('Councils with sections: secondary', cs.filter((c) => c.secondary).length, '(141) primary', cs.filter((c) => c.primary).length, '(150) any', cs.length);
console.log('Unmatched LA names:', [...unmatchedLa], '| top-list rows without school page:', [...out.top.secondary, ...out.top.primary].filter((r) => !r.slug).length, '| rows without council slug:', [...all['7'], ...all.R].filter((r) => !r.councilSlug).length);
