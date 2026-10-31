// Council-level school statistics for /school-statistics-by-council/ and the council page snapshots.
// Reads the school register and the per-school DfE files already in the repo. Writes src/data/council-stats.json and public/downloads/school-statistics-by-council-2026.csv.
// Run: node scripts/gen-council-stats.mjs
import { readFileSync, writeFileSync } from 'fs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const schools = J('src/data/schools.json');
const las = J('src/data/las.json');
const grades = J('src/data/ofsted-grades.json');
const perf = J('data/performance.json');
const facts = J('data/schoolfacts.json');
const dest = J('data/destinations.json');
const os = J('src/data/oversubscription.json');

const STATE = new Set(['Academy converter', 'Community school', 'Academy sponsor led', 'Voluntary aided school', 'Voluntary controlled school', 'Foundation school', 'Free schools',
  'Community special school', 'Local authority nursery school', 'Academy special converter', 'Free schools special', 'Academy special sponsor led', 'Foundation special school',
  'Pupil referral unit', 'Academy alternative provision converter', 'Academy alternative provision sponsor led', 'Free schools alternative provision', 'University technical college', 'Studio schools', 'City technology college']);
const isMainstream = (s) => !/special|pupil referral|alternative provision/i.test(s.type) && s.phase !== 'Special' && s.phase !== 'Nursery' && s.phase !== 'Not applicable';
const isSecondaryLike = (s) => ['Secondary', 'All through', 'Middle deemed secondary'].includes(s.phase);

const laName = Object.fromEntries(las.map((l) => [l.slug, l.name.replace(/ Of /g, ' of ')]));
const state = schools.filter((s) => STATE.has(s.type));
const byLa = {};
for (const s of state) (byLa[s.laSlug] ??= []).push(s);
const slugs = Object.keys(byLa).sort((a, b) => laName[a].localeCompare(laName[b]));

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const wmean = (rows) => {
  const w = rows.reduce((t, r) => t + r[1], 0);
  return w > 0 ? rows.reduce((t, r) => t + r[0] * r[1], 0) / w : null;
};

// Each metric: pick returns [value, weight] for a contributing school; min = schools needed to publish a council figure.
const ABS_Y = '2024-25', A8_Y = '2024-25', P8_Y = '2023-24', DEST_C = '2023-24';
const METRICS = {
  goodOutstanding: { dp: 1, min: 5, pick: (s) => { const g = grades[s.urn]?.[0]; return g ? [g === 1 || g === 2 ? 100 : 0, 1] : null; } },
  absence: { dp: 1, min: 3, pick: (s) => { const r = perf[s.urn]?.[ABS_Y]; return isMainstream(s) && isSecondaryLike(s) && r?.abs_overall != null && s.pupils > 0 ? [r.abs_overall, s.pupils] : null; } },
  persistentAbsence: { dp: 1, min: 3, pick: (s) => { const r = perf[s.urn]?.[ABS_Y]; return isMainstream(s) && isSecondaryLike(s) && r?.abs_persistent != null && s.pupils > 0 ? [r.abs_persistent, s.pupils] : null; } },
  attainment8: { dp: 1, min: 3, pick: (s) => { const r = perf[s.urn]?.[A8_Y]; return isMainstream(s) && isSecondaryLike(s) && r?.a8 > 0 && r.ks4_cohort > 0 ? [r.a8, r.ks4_cohort] : null; } },
  progress8: { dp: 2, min: 3, pick: (s) => { const r = perf[s.urn]?.[P8_Y]; return isMainstream(s) && isSecondaryLike(s) && r?.p8 != null && r.ks4_cohort > 0 ? [r.p8, r.ks4_cohort] : null; } },
  ehcp: { dp: 1, min: 5, pick: (s) => { const f = facts[s.urn]?.send; return f?.ehc_pct != null && f.pupils > 0 ? [f.ehc_pct, f.pupils] : null; } },
  senSupport: { dp: 1, min: 5, pick: (s) => { const f = facts[s.urn]?.send; return f?.sen_support_pct != null && f.pupils > 0 ? [f.sen_support_pct, f.pupils] : null; } },
  ptr: { dp: 1, min: 5, pick: (s) => { const w = facts[s.urn]?.workforce; return isMainstream(s) && w?.ptr > 0 && w.fte_teachers > 0 ? [w.ptr, w.fte_teachers] : null; } },
  destinations: { dp: 1, min: 3, pick: (s) => { const r = dest[s.urn]?.[DEST_C]?.ks4; return isMainstream(s) && isSecondaryLike(s) && r?.sustained != null && r.cohort_n > 0 ? [r.sustained, r.cohort_n] : null; } },
};

const out = { councils: {}, national: {} };
const agg = (list, m) => { const rows = list.map(m.pick).filter(Boolean); return { rows, n: rows.length }; };
for (const slug of slugs) {
  const list = byLa[slug];
  const c = {
    name: laName[slug], schools: list.length,
    primary: list.filter((s) => s.phase === 'Primary').length, secondary: list.filter((s) => s.phase === 'Secondary').length,
    reportCards: list.filter((s) => grades[s.urn]?.[1] === 1).length,
    gradedSchools: list.filter((s) => grades[s.urn]?.[0] > 0).length,
  };
  for (const [k, m] of Object.entries(METRICS)) {
    const { rows, n } = agg(list, m);
    const v = n >= m.min ? wmean(rows) : null;
    c[k] = { v: v == null ? null : round(v, m.dp), n };
  }
  out.councils[slug] = c;
}
// Oversubscription: DfE local-authority file figure, as published (not recomputed). n = applications received.
// Rank is the position in os.councilRank (highest share first, ties by name): the rank the oversubscribed-schools page and each council page's oversubscription section already show.
const osByLa = { secondary: {}, primary: {} };
for (const ph of ['secondary', 'primary']) os.councilRank[ph].forEach((r, i, all) => { osByLa[ph][r.slug] = { v: r.pct, n: r.apps, of: all.length, rank: all.length - i, rankHigh: i + 1 }; });
const noFig = (of) => ({ v: null, n: null, of, rank: null, rankHigh: null });
for (const slug of slugs) {
  out.councils[slug].year7NotOffered = osByLa.secondary[slug] ?? noFig(os.councilRank.secondary.length);
  out.councils[slug].receptionNotOffered = osByLa.primary[slug] ?? noFig(os.councilRank.primary.length);
}
// rank: 1 = lowest value. rankHigh: 1 = highest value. Ties share a rank. of = councils with a published figure.
for (const k of Object.keys(METRICS)) {
  const vals = slugs.map((s) => out.councils[s][k].v).filter((v) => v != null);
  for (const s of slugs) {
    const x = out.councils[s][k];
    x.of = vals.length;
    x.rank = x.v == null ? null : 1 + vals.filter((v) => v < x.v).length;
    x.rankHigh = x.v == null ? null : 1 + vals.filter((v) => v > x.v).length;
  }
}
for (const [k, m] of Object.entries(METRICS)) out.national[k] = round(wmean(agg(state, m).rows), m.dp);
out.national.schools = state.length;
out.national.reportCards = state.filter((s) => grades[s.urn]?.[1] === 1).length;
out.national.gradedSchools = state.filter((s) => grades[s.urn]?.[0] > 0).length;
out.national.year7NotOffered = os.national.secondary.notOffered['2026-27'].notOfferedPct;
out.national.receptionNotOffered = os.national.primary.notOffered['2026-27'].notOfferedPct;

const X = 'https://explore-education-statistics.service.gov.uk/find-statistics/';
const OFS = 'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes';
out.meta = {
  generated: new Date().toISOString().slice(0, 10),
  councils: slugs.length, stateSchools: state.length,
  minSchools: Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, m.min])),
  metrics: {
    schools: { label: 'State-funded schools', year: 'Open schools register, 2026', source: 'DfE Get Information about Schools', url: 'https://get-information-schools.service.gov.uk/' },
    goodOutstanding: { label: 'Good or Outstanding at latest graded Ofsted inspection', unit: '%', year: 'Ofsted data as at 30 September 2026', source: 'Ofsted, state-funded schools inspections and outcomes', url: OFS, basis: 'Share of schools with a graded inspection. A simple share of schools with no pupil weighting.' },
    reportCards: { label: 'Schools with an Ofsted report card', year: 'Ofsted data as at 30 September 2026', source: 'Ofsted, state-funded schools inspections and outcomes', url: OFS, basis: 'Count of schools.' },
    year7NotOffered: { label: 'Year 7 applicants not offered first preference', unit: '%', year: 'September 2026 entry', source: 'DfE, Primary and secondary school applications and offers 2026/27, local-authority file', url: os.meta.publication, basis: "DfE's own council figure as published. The share is out of applications received by the council." },
    receptionNotOffered: { label: 'Reception applicants not offered first preference', unit: '%', year: 'September 2026 entry', source: 'DfE, Primary and secondary school applications and offers 2026/27, local-authority file', url: os.meta.publication, basis: "DfE's own council figure as published. The share is out of applications received by the council." },
    attainment8: { label: 'Average Attainment 8 score', unit: 'points', year: '2024-25 (final)', source: 'DfE, Key stage 4 performance', url: X + 'key-stage-4-performance', basis: 'School averages weighted by the number of pupils at the end of key stage 4. Mainstream state secondary and all-through schools with a published score.' },
    progress8: { label: 'Average Progress 8 score', unit: 'score', year: '2023-24 (latest year published)', source: 'DfE, Key stage 4 performance', url: X + 'key-stage-4-performance', basis: 'School scores weighted by the number of pupils at the end of key stage 4. Mainstream state secondary and all-through schools with a published score. DfE did not publish Progress 8 for 2024-25 or 2025-26.' },
    absence: { label: 'Overall absence rate in secondary schools', unit: '%', year: '2024-25', source: 'DfE, Pupil absence in schools in England', url: X + 'pupil-absence-in-schools-in-england', basis: 'Secondary and all-through mainstream state schools only. The primary absence file is not loaded here. School rates weighted by pupils on roll in the schools register. DfE does not publish a council rate with this weighting. Its own council tables differed by up to about one percentage point in spot checks.' },
    persistentAbsence: { label: 'Persistent absence rate in secondary schools', unit: '%', year: '2024-25', source: 'DfE, Pupil absence in schools in England', url: X + 'pupil-absence-in-schools-in-england', basis: 'Pupils missing 10% or more of sessions. Secondary and all-through mainstream state schools only. School rates weighted by pupils on roll in the schools register. DfE\'s own council tables differed by up to about one percentage point in spot checks.' },
    ehcp: { label: 'Pupils with an EHC plan', unit: '%', year: '2025/26 (January 2026 census)', source: 'DfE, Special educational needs in England', url: X + 'special-educational-needs-in-england', basis: 'School percentages weighted by pupils on roll. This equals council pupils with a plan divided by council pupils. All state-funded schools including special schools. DfE\'s own council tables also count independent and 16 to 19 schools and so differ.' },
    senSupport: { label: 'Pupils on SEN support', unit: '%', year: '2025/26 (January 2026 census)', source: 'DfE, Special educational needs in England', url: X + 'special-educational-needs-in-england', basis: 'School percentages weighted by pupils on roll. All state-funded schools including special schools. DfE\'s own council tables also count independent and 16 to 19 schools and so differ.' },
    ptr: { label: 'Pupils per teacher', unit: 'pupils', year: '2025/26 (November 2025 census)', source: 'DfE, School workforce in England', url: X + 'school-workforce-in-england', basis: 'School ratios weighted by full-time-equivalent teachers. This equals council pupils divided by council teachers. Mainstream state schools only.' },
    destinations: { label: 'Pupils in a sustained destination after key stage 4', unit: '%', year: 'Finished Year 11 in 2023-24, destinations in 2024/25 (provisional)', source: 'DfE, Key stage 4 destination measures', url: X + 'key-stage-4-destination-measures', basis: 'Sustained education, apprenticeship or employment. School percentages weighted by cohort size. Mainstream state secondary and all-through schools. DfE\'s own council figures count every pupil including those at schools without a published figure and so differ slightly.' },
  },
  dropped: { spendingPerPupil: 'Academies and council-maintained schools report spending on different returns and for different years (2024/25 and 2025-26), so a council figure would mostly show how many of its schools are academies.' },
};

writeFileSync('src/data/council-stats.json', JSON.stringify(out));

const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = [['Council', (c) => c.name], ['State-funded schools', (c) => c.schools],
  ['Graded schools', (c) => c.gradedSchools], ['Percent Good or Outstanding', (c) => c.goodOutstanding.v], ['Schools with Ofsted report card', (c) => c.reportCards],
  ['Percent Year 7 applicants not offered first preference 2026', (c) => c.year7NotOffered.v], ['Percent Reception applicants not offered first preference 2026', (c) => c.receptionNotOffered.v],
  ['Average Attainment 8 2024-25', (c) => c.attainment8.v], ['Schools in Attainment 8 average', (c) => c.attainment8.n],
  ['Average Progress 8 2023-24', (c) => c.progress8.v], ['Schools in Progress 8 average', (c) => c.progress8.n],
  ['Secondary overall absence percent 2024-25', (c) => c.absence.v], ['Secondary persistent absence percent 2024-25', (c) => c.persistentAbsence.v], ['Secondary schools in absence average', (c) => c.absence.n],
  ['Percent pupils with EHC plan 2025/26', (c) => c.ehcp.v], ['Percent pupils on SEN support 2025/26', (c) => c.senSupport.v],
  ['Pupils per teacher 2025/26', (c) => c.ptr.v],
  ['Percent sustained destination after KS4 (Year 11 in 2023-24)', (c) => c.destinations.v], ['Schools in destinations average', (c) => c.destinations.n]];
const csv = [cols.map((c) => q(c[0])).join(','), ...slugs.map((s) => cols.map((c) => q(c[1](out.councils[s]))).join(','))].join('\n') + '\n';
writeFileSync('public/downloads/school-statistics-by-council-2026.csv', csv);
console.log('councils', slugs.length, 'state schools', state.length);
console.log(out.national);
