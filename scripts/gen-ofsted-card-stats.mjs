/**
 * Report-card statistics for /ofsted-report-card-statistics/.
 * Input: data/ofsted-latest-2026-09-30.csv (Ofsted MI, state-funded schools, latest inspections as at 30 Sep 2026),
 *        src/data/ofsted-map.json (last graded judgement per URN, built by import-ofsted.mjs), src/data/schools.json (council slug).
 * Output: src/data/ofsted-card-stats.json, public/downloads/ofsted-report-card-results-2026.csv
 * Run: node scripts/gen-ofsted-card-stats.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const SRC = 'data/ofsted-latest-2026-09-30.csv';
const rows = parse(new TextDecoder('windows-1252').decode(readFileSync(SRC)).replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
const map = JSON.parse(readFileSync('src/data/ofsted-map.json', 'utf8'));
const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
const laByUrn = new Map(schools.map((s) => [String(s.urn), { slug: s.laSlug, name: s.la }]));

const clean = (s) => String(s ?? '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'");
const v = (x) => (x == null || x === '' || x === 'NULL' ? null : x);
const iso = (d) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const GRADES = ['Exceptional', 'Strong standard', 'Expected standard', 'Needs attention', 'Urgent improvement'];
const AREAS = [['inc', 'Inclusion', 'Inclusion'], ['cur', 'Curriculum and teaching', 'Curriculum and teaching'], ['ach', 'Achievement', 'Achievement'],
  ['att', 'Attendance and behaviour', 'Attendance and behaviour'], ['pdw', 'Personal development and wellbeing', 'Personal development and wellbeing'],
  ['ey', 'Early years', 'Early years (where applicable)'], ['p16', 'Post-16 provision', 'Post-16 provision (where applicable)'], ['lg', 'Leadership and governance', 'Leadership and governance']];
const PREV = { 1: 'Outstanding', 2: 'Good', 3: 'Requires improvement', 4: 'Inadequate' };
const grp = (p) => (p === 'Primary' ? 'primary' : p === 'Secondary' ? 'secondary' : 'other');

const cards = rows.filter((r) => v(r['Inspection number of latest full inspection']) && v(r['Curriculum and teaching']));
const rc = cards.map((r) => ({
  urn: r.URN, name: clean(r['School name']), phase: r['Ofsted phase'], g: grp(r['Ofsted phase']), type: clean(r['Type of education']), region: r.Region,
  la: clean(r['Local authority']), start: iso(r['Inspection start date']), pub: iso(r['Publication date']), sg: r['Safeguarding standards'],
  areas: Object.fromEntries(AREAS.map(([k, , col]) => [k, r[col]])),
  prev: PREV[r['Latest OEIF overall effectiveness']] ?? null, prevJudged: r['Latest OEIF overall effectiveness'], prevDate: iso(r['Inspection start date of latest OEIF graded inspection']),
}));

const r1 = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const dist = (list, k) => {
  const counts = Object.fromEntries(GRADES.map((g) => [g, 0])); let n = 0;
  for (const c of list) { const x = c.areas[k]; if (counts[x] != null) { counts[x]++; n++; } }
  const hi = counts.Exceptional + counts['Strong standard'], lo = counts['Needs attention'] + counts['Urgent improvement'];
  return { n, counts, pct: Object.fromEntries(GRADES.map((g) => [g, r1(counts[g], n)])), strongOrBetter: hi, strongOrBetterPct: r1(hi, n), belowExpected: lo, belowExpectedPct: r1(lo, n) };
};
const areaTable = (list) => Object.fromEntries(AREAS.map(([k]) => [k, dist(list, k)]));
const byG = (g) => rc.filter((c) => c.g === g);

const out = { meta: {}, cards: {}, areas: {}, safeguarding: {}, crossTab: {}, councils: {}, waiting: {} };
const dates = rc.map((c) => c.start).sort(); const pubs = rc.map((c) => c.pub).filter(Boolean).sort();
out.meta = {
  asAt: '2026-09-30', source: 'Ofsted, Management information - state-funded schools - latest inspections as at 30 Sep 2026',
  indexPage: 'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes',
  fileUrl: 'https://assets.publishing.service.gov.uk/media/6ad095a72de3184ccf8b818d/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Sep_2026.csv',
  firstInspection: dates[0], lastInspection: dates.at(-1), lastPublication: pubs.at(-1), schoolsInFile: rows.length,
  areaLabels: Object.fromEntries(AREAS.map(([k, l]) => [k, l])), grades: GRADES,
};
out.cards = {
  total: rc.length, shareOfSchoolsPct: r1(rc.length, rows.length),
  byPhase: Object.fromEntries(['primary', 'secondary', 'other'].map((g) => [g, { cards: byG(g).length, schools: rows.filter((r) => grp(r['Ofsted phase']) === g).length }])),
  byPhaseDetail: Object.fromEntries([...new Set(rc.map((c) => c.phase))].sort().map((p) => [p, { cards: rc.filter((c) => c.phase === p).length, schools: rows.filter((r) => r['Ofsted phase'] === p).length }])),
  byMonth: Object.fromEntries([...new Set(rc.map((c) => c.start.slice(0, 7)))].sort().map((m) => [m, rc.filter((c) => c.start.startsWith(m)).length])),
};
for (const g of Object.values(out.cards.byPhase)) g.sharePct = r1(g.cards, g.schools);
out.areas = { all: areaTable(rc), primary: areaTable(byG('primary')), secondary: areaTable(byG('secondary')) };
const sgNot = rc.filter((c) => c.sg === 'Not met');
out.safeguarding = {
  met: rc.filter((c) => c.sg === 'Met').length, notMet: sgNot.length, notMetPct: r1(sgNot.length, rc.length),
  byPhase: Object.fromEntries(['primary', 'secondary', 'other'].map((g) => [g, { cards: byG(g).length, notMet: byG(g).filter((c) => c.sg === 'Not met').length }])),
};
// Previous graded overall effectiveness (latest OEIF graded inspection) against report card areas.
const prevRows = Object.values(PREV).map((label) => {
  const list = rc.filter((c) => c.prev === label);
  return { label, n: list.length, ach: dist(list, 'ach'), lg: dist(list, 'lg') };
});
const prevDates = rc.filter((c) => c.prev).map((c) => c.prevDate).sort();
out.crossTab = {
  rows: prevRows, withPrevious: prevRows.reduce((a, r) => a + r.n, 0),
  notJudged: rc.filter((c) => c.prevJudged === 'Not judged').length, noOeifGrade: rc.filter((c) => !c.prev && c.prevJudged !== 'Not judged').length,
  prevDateRange: [prevDates[0], prevDates.at(-1)],
};
// Councils with 10+ report cards.
const laCount = {}; let unmatched = 0;
for (const c of rc) {
  const l = laByUrn.get(c.urn); if (!l) { unmatched++; continue; }
  (laCount[l.slug] ??= { slug: l.slug, name: l.name, cards: 0, notMet: 0, schools: 0, achBelow: 0 }).cards++;
  if (c.sg === 'Not met') laCount[l.slug].notMet++;
  if (['Needs attention', 'Urgent improvement'].includes(c.areas.ach)) laCount[l.slug].achBelow++;
}
for (const r of rows) { const l = laByUrn.get(r.URN); if (l && laCount[l.slug]) laCount[l.slug].schools++; }
const councilList = Object.values(laCount).sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name));
for (const c of councilList) c.sharePct = r1(c.cards, c.schools);
out.councils = { minCards: 10, unmatchedCards: unmatched, councilsWithAnyCard: councilList.length, councilsWithTen: councilList.filter((c) => c.cards >= 10).length, list: councilList.filter((c) => c.cards >= 10) };
// Schools still waiting: no report card yet, by year of last graded inspection.
const cardUrns = new Set(rc.map((c) => c.urn));
const waitingRows = rows.filter((r) => !cardUrns.has(r.URN));
const yr = (d) => Number(String(d).split('/').pop());
const GL = { 1: 'Outstanding', 2: 'Good', 3: 'Requires improvement', 4: 'Inadequate' };
const buckets = ['2014 or earlier', ...Array.from({ length: 12 }, (_, i) => String(2015 + i))];
const grid = Object.fromEntries(buckets.map((b) => [b, { Outstanding: 0, Good: 0, 'Requires improvement': 0, Inadequate: 0, total: 0 }]));
// Graded inspections of state-funded schools stopped giving an overall grade in September 2024 ("Not judged"), so those schools sit under their earlier grade.
let noGraded = 0, graded = 0; const nj = { total: 0, noEarlierGrade: 0, inTable: 0, outstanding: 0, outstandingBefore2015: 0, dates: [], restOpened: [] };
for (const r of waitingRows) {
  const notJudged = r['Latest OEIF overall effectiveness'] === 'Not judged';
  if (notJudged) { nj.total++; nj.dates.push(iso(r['Inspection start date of latest OEIF graded inspection'])); }
  const m = map[r.URN]; if (!m?.ofstedRating || !m.ofstedDate) { noGraded++; if (notJudged) nj.noEarlierGrade++; else nj.restOpened.push(yr(r['School open date'])); continue; }
  graded++; const y = yr(m.ofstedDate); const b = y <= 2014 ? buckets[0] : String(y);
  grid[b][GL[m.ofstedRating]]++; grid[b].total++;
  if (notJudged) { nj.inTable++; if (m.ofstedRating === '1') { nj.outstanding++; if (b === buckets[0]) nj.outstandingBefore2015++; } }
}
nj.dates.sort(); const njRange = [nj.dates[0], nj.dates.at(-1)]; delete nj.dates;
const restOpenedFrom = Math.min(...nj.restOpened.filter(Number.isFinite)); nj.restNoGrade = nj.restOpened.length; delete nj.restOpened; nj.restOpenedFrom = restOpenedFrom;
const osBefore = (y) => buckets.filter((b) => (b === buckets[0] ? true : Number(b) < y)).reduce((a, b) => a + grid[b].Outstanding, 0);
out.waiting = {
  noReportCard: waitingRows.length, withGraded: graded, noGradedOnRecord: noGraded, grid, buckets, noOverallGrade: { ...nj, dateRange: njRange },
  outstandingTotal: osBefore(9999), outstandingBefore2015: grid[buckets[0]].Outstanding, outstandingBefore2020: osBefore(2020),
  byGrade: Object.fromEntries(Object.values(GL).map((l) => [l, { total: buckets.reduce((a, b) => a + grid[b][l], 0), before2015: grid[buckets[0]][l], before2020: buckets.filter((b) => b === buckets[0] || Number(b) < 2020).reduce((a, b) => a + grid[b][l], 0) }])),
  gradedBefore2020: buckets.filter((b) => b === buckets[0] || Number(b) < 2020).reduce((a, b) => a + grid[b].total, 0),
};
writeFileSync('src/data/ofsted-card-stats.json', JSON.stringify(out, null, 1) + '\n');

// CSV, RFC 4180 quoting.
const q = (x) => { const s = x == null ? '' : String(x); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const head = ['URN', 'School name', 'Ofsted phase', 'Type of education', 'Local authority', 'Region', 'Inspection start date', 'Publication date', 'Safeguarding standards',
  ...AREAS.map(([, l]) => l), 'Previous graded overall effectiveness (OEIF)', 'Previous graded inspection start date'];
const lines = [head.map(q).join(',')];
for (const c of rc) lines.push([c.urn, c.name, c.phase, c.type, c.la, c.region, c.start, c.pub, c.sg, ...AREAS.map(([k]) => c.areas[k]), c.prev ?? '', c.prev ? c.prevDate : ''].map(q).join(','));
writeFileSync('public/downloads/ofsted-report-card-results-2026.csv', lines.join('\r\n') + '\r\n');
console.log(`cards ${out.cards.total}, not met ${out.safeguarding.notMet}, unmatched LA ${unmatched}, councils 10+ ${out.councils.councilsWithTen}`);
