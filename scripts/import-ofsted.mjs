/**
 * Builds src/data/ofsted-map.json (URN -> Ofsted data) from Ofsted Management Information CSVs.
 * No D1 writes. Run: node scripts/import-ofsted.mjs
 *
 * Inputs (see src/data/ofsted-sources.json):
 *  - NEW  latest inspections as at 30 Sep 2026: report-card areas, latest OEIF graded, latest ungraded.
 *  - OLD  latest inspections as at 31 Dec 2025: latest/previous graded incl. pre-2019 (pre-OEIF) grades.
 * Most recent graded judgement = newest start date among NEW OEIF graded, OLD latest graded, OLD previous graded.
 * Output keys: ofstedRating/ofstedDate (legacy, graded rating 1-4 + inspection start date dd/mm/yyyy), ud/uo (latest ungraded date + outcome, only if newer than the graded inspection),
 * rc/rcd (report-card areas as grade codes 1 Exceptional..5 Urgent improvement, sg 1=Met 0=Not met; + inspection start date), gx=1 (graded under a predecessor URN), ot (Ofsted provider type for the report URL, omitted when 21).
 */
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const NEW = 'data/ofsted-latest-2026-09-30.csv';
const OLD = 'data/ofsted-latest-2025-12-31.csv';
const OUT = 'src/data/ofsted-map.json';

const load = (f) => parse(readFileSync(f, 'utf8').replace(/^﻿/, ''),
  { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
const v = (x) => (x == null || x === '' || x === 'NULL' ? null : x);
const ts = (d) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(d || ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0; };
const grade = (x) => (['1', '2', '3', '4'].includes(x) ? x : null);

// Ofsted report URL provider-type code by Ofsted phase (verified HTTP 200 on samples).
const TYPE = { Nursery: 20, Primary: 21, 'Alternative provision': 22, Secondary: 23, Special: 25 };

// Report-card area keys (compact). Legend is written to ofsted-sources.json.
const GRADE = { Exceptional: 1, 'Strong standard': 2, 'Expected standard': 3, 'Needs attention': 4, 'Urgent improvement': 5 };
const UNG = (o) => o.replace(/^School /, '').replace(/ - S5 Next$/, '');
const AREAS = {
  sg: 'Safeguarding standards', inc: 'Inclusion', cur: 'Curriculum and teaching', ach: 'Achievement',
  att: 'Attendance and behaviour', pdw: 'Personal development and wellbeing', ey: 'Early years (where applicable)',
  p16: 'Post-16 provision (where applicable)', lg: 'Leadership and governance',
};

const urns = new Map(); // urn -> working record
const rec = (u) => { if (!urns.has(u)) urns.set(u, { cands: [] }); return urns.get(u); };

for (const r of load(OLD)) {
  const u = v(r.URN); if (!u) continue; const R = rec(u);
  R.phase = v(r['Ofsted phase']);
  const g1 = grade(r['Overall effectiveness']);
  if (g1) R.cands.push({ g: g1, start: r['Inspection start date'], pub: r['Publication date'], other: r['Does the latest graded inspection relate to the URN of the current school?'] === 'No' });
  const g2 = grade(r['Previous graded inspection overall effectiveness']);
  if (g2) R.cands.push({ g: g2, start: r['Previous inspection start date'], pub: r['Previous publication date'], other: r['Does the previous graded inspection relate to the URN of the current school?'] === 'No' });
  if (v(r['Date of latest ungraded inspection'])) R.ungOld = { d: r['Date of latest ungraded inspection'], o: v(r['Ungraded inspection overall outcome']) };
}

for (const r of load(NEW)) {
  const u = v(r.URN); if (!u) continue; const R = rec(u);
  R.phase = v(r['Ofsted phase']) || R.phase;
  const g = grade(r['Latest OEIF overall effectiveness']);
  if (g) R.cands.push({ g, start: r['Inspection start date of latest OEIF graded inspection'], pub: r['Publication date of latest OEIF graded inspection'], other: r['Does the latest OEIF graded inspection relate to the URN of the current school?'] === 'No' });
  if (v(r['Date of latest ungraded inspection'])) R.ung = { d: r['Date of latest ungraded inspection'], o: v(r['Ungraded inspection overall outcome']) };
  if (v(r['Inspection number of latest full inspection']) && v(r['Curriculum and teaching'])) {
    const card = {};
    for (const [k, col] of Object.entries(AREAS)) { const x = v(r[col]); if (!x || x === 'Not applicable') continue; card[k] = k === 'sg' ? (x === 'Met' ? 1 : 0) : (GRADE[x] ?? x); }
    R.card = card; R.cardDate = r['Inspection start date'];
  }
}

const out = {};
for (const [u, R] of urns) {
  const e = {};
  const best = R.cands.filter((c) => ts(c.start)).sort((a, b) => ts(b.start) - ts(a.start))[0];
  if (best) {
    e.ofstedRating = best.g; e.ofstedDate = best.start; // legacy fields the pages read
    if (best.other) e.gx = 1; // graded under a different URN (predecessor school)
  }
  const ung = R.ung || R.ungOld;
  if (ung && ung.o && ts(ung.d) > (best ? ts(best.start) : 0)) { e.ud = ung.d; e.uo = UNG(ung.o); }
  if (R.card && Object.keys(R.card).length) { e.rc = R.card; e.rcd = R.cardDate; }
  if (!Object.keys(e).length) continue;
  if (R.phase && TYPE[R.phase] && TYPE[R.phase] !== 21) e.ot = TYPE[R.phase]; // inspectionUrl = https://reports.ofsted.gov.uk/provider/${e.ot ?? 21}/{urn}
  out[u] = e;
}

writeFileSync(OUT, JSON.stringify(out));
const n = Object.keys(out).length;
console.log(`Wrote ${OUT}: ${n} URNs, ${Object.values(out).filter((e) => e.ofstedRating).length} with a graded rating, ` +
  `${Object.values(out).filter((e) => e.rc).length} with report card`);
