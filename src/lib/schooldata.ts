// Parent-facing data from D1 (ofsted, admissions, destinations, schoolfacts) for school and compare pages.
// One db.batch per page. Every table is optional: a missing table or row degrades to "hidden / Not published".

export const NP = 'Not published';

export type SchoolData = { ofsted: any | null; adm: any[]; dest: any[]; facts: any | null; ranks: any[] };

export async function loadSchoolData(db: any, urns: string[]): Promise<Record<string, SchoolData>> {
  const out: Record<string, SchoolData> = {};
  for (const u of urns) out[u] = { ofsted: null, adm: [], dest: [], facts: null, ranks: [] };
  const ph = urns.map(() => '?').join(',');
  const stmts = [
    `SELECT * FROM ofsted WHERE urn IN (${ph})`,
    `SELECT * FROM admissions WHERE urn IN (${ph}) ORDER BY year DESC`,
    `SELECT * FROM destinations WHERE urn IN (${ph}) ORDER BY cohort DESC`,
    `SELECT * FROM schoolfacts WHERE urn IN (${ph})`,
  ].map((q) => db.prepare(q).bind(...urns));
  try {
    const [o, a, d, f] = (await db.batch(stmts)) as any[];
    for (const r of o.results) out[r.urn].ofsted = r;
    for (const r of a.results) out[r.urn].adm.push(r);
    for (const r of d.results) out[r.urn].dest.push(r);
    for (const r of f.results) out[r.urn].facts = r;
  } catch { /* tables not loaded */ }
  // Ranks are optional and fetched on their own so a missing school_ranks table cannot hide the other sections.
  try {
    const r = (await db.prepare(`SELECT * FROM school_ranks WHERE urn IN (${ph})`).bind(...urns).all()) as any;
    for (const row of r.results ?? []) out[row.urn]?.ranks.push(row);
  } catch { /* school_ranks not loaded */ }
  return out;
}

// ---------- Rankings ("How this school compares") ----------
const ord = (n: number) => { const m100 = n % 100, m10 = n % 10; return `${n.toLocaleString('en-GB')}${m100 >= 11 && m100 <= 13 ? 'th' : m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th'}`; };
// "2023-24 (provisional)" becomes "2023-24 results (provisional)".
const withProv = (y: string, noun: string) => { const p = / \(provisional\)$/.test(y); return `${y.replace(/ \(provisional\)$/, '')} ${noun}${p ? ' (provisional)' : ''}`; };
type RankMeta = { label: string; top: string; src: keyof typeof SRC; srcShort: string; yearText: (r: any) => string; fmt: (v: number) => string; value: string; caveat?: string };
const P8_CAVEAT = 'Progress 8 was not calculated for the 2024-25 and 2025-26 results because those pupils had no key stage 2 results to measure progress from. The latest Progress 8 year is 2023-24.';
const SPEND_CAVEAT = 'Council maintained schools and academies report spending on different bases. Each is ranked only against its own kind.';
const RANK_META: Record<string, RankMeta> = {
  fppo_y7: { label: 'first preferences per offer at Year 7 entry', top: 'most first preferences per offer', src: 'admissions', srcShort: 'DfE school applications and offers', yearText: (r) => `${r.year} entry`, fmt: (v) => v.toFixed(2), value: 'per offer' },
  fppo_r: { label: 'first preferences per offer at Reception entry', top: 'most first preferences per offer', src: 'admissions', srcShort: 'DfE school applications and offers', yearText: (r) => `${r.year} entry`, fmt: (v) => v.toFixed(2), value: 'per offer' },
  p8: { label: 'Progress 8', top: 'highest Progress 8 score', src: 'ks4final', srcShort: 'DfE key stage 4 performance', yearText: (r) => withProv(r.year, 'results'), fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2), value: '', caveat: P8_CAVEAT },
  a8: { label: 'Attainment 8', top: 'highest Attainment 8 score', src: 'ks4final', srcShort: 'DfE key stage 4 performance', yearText: (r) => withProv(r.year, 'results'), fmt: (v) => v.toFixed(1), value: '' },
  abs_overall: { label: 'overall absence', top: 'lowest overall absence rate', src: 'absence', srcShort: 'DfE pupil absence in schools in England', yearText: (r) => String(r.year), fmt: (v) => `${v.toFixed(1)}%`, value: 'of sessions' },
  abs_persistent: { label: 'persistent absence', top: 'lowest persistent absence rate', src: 'absence', srcShort: 'DfE pupil absence in schools in England', yearText: (r) => String(r.year), fmt: (v) => `${v.toFixed(1)}%`, value: 'of pupils' },
  dest_ks4: { label: 'Year 11 leavers in a sustained destination', top: 'highest share in a sustained destination', src: 'destinations', srcShort: 'DfE key stage 4 destination measures', yearText: (r) => withProv(r.year, 'leavers'), fmt: (v) => `${v.toFixed(1)}%`, value: 'of leavers' },
  dest_1618: { label: 'sixth form leavers in a sustained destination', top: 'highest share in a sustained destination', src: 'destinations', srcShort: 'DfE 16 to 18 destination measures', yearText: (r) => withProv(r.year, 'leavers'), fmt: (v) => `${v.toFixed(1)}%`, value: 'of leavers' },
  ptr: { label: 'pupils per teacher', top: 'fewest pupils per teacher', src: 'workforce', srcShort: 'DfE school workforce in England', yearText: () => 'November 2025 census', fmt: (v) => v.toFixed(1), value: 'pupils per teacher' },
  spend_cfr: { label: 'total spending per pupil', top: 'highest spending per pupil', src: 'cfr', srcShort: 'DfE schools financial benchmarking, council maintained schools', yearText: (r) => `${r.year} financial year`, fmt: (v) => `£${Math.round(v).toLocaleString('en-GB')}`, value: 'per pupil', caveat: `${SPEND_CAVEAT} Figures cover revenue spending and leave out capital spending.` },
  spend_aar: { label: 'total spending per pupil', top: 'highest spending per pupil', src: 'aar', srcShort: 'DfE schools financial benchmarking, academies', yearText: (r) => `${r.year} academy year`, fmt: (v) => `£${Math.round(v).toLocaleString('en-GB')}`, value: 'per pupil', caveat: `${SPEND_CAVEAT} Figures cover revenue spending and leave out capital spending and the trust's central spending.` },
};
// Display order; only the first MAX_RANK_ROWS present are shown. Persistent absence goes last so it appears only when there is room.
const RANK_ORDER = ['fppo_y7', 'fppo_r', 'p8', 'a8', 'abs_overall', 'dest_ks4', 'dest_1618', 'ptr', 'spend_cfr', 'spend_aar', 'abs_persistent'];
const MAX_RANK_ROWS = 5;
const POOL_LABEL: Record<string, string> = { year7: 'secondary schools', reception: 'schools with a Reception intake', secondary: 'secondary schools', primary: 'primary schools', 'all-through': 'all-through schools' };
const laLabel = (la: string) => la.replace(/^(.+), (City|County) of$/, '$2 of $1');

export type RankRow = { metric: string; sentence: string; note: string; caveat: string; source: string; sourceShort: string; yearText: string; valueText: string };
/** One plain sentence per metric the school has a rank for. A council rank is used only when the council pool has 10 or more schools (the table stores NULL otherwise). */
export function rankRows(s: any, ranks: any[]): RankRow[] {
  const by: Record<string, any> = {};
  for (const r of ranks ?? []) if (RANK_META[r.metric] && num(r.rank) != null && num(r.of_n) != null && Number(r.of_n) >= 30) by[r.metric] = r;
  const la = laLabel(String(s.la ?? ''));
  const rows: RankRow[] = [];
  for (const m of RANK_ORDER) {
    const r = by[m]; if (!r) continue;
    const meta = RANK_META[m];
    const pool = POOL_LABEL[r.pool] ?? 'schools';
    const kind = m === 'spend_cfr' ? 'council maintained ' : m === 'spend_aar' ? 'academy ' : '';
    const hasLa = la && num(r.la_rank) != null && num(r.la_of_n) != null && Number(r.la_of_n) >= 10;
    const v = num(r.value);
    rows.push({
      metric: m,
      sentence: `Ranked ${ord(Number(r.rank))} of ${Number(r.of_n).toLocaleString('en-GB')} ${kind}${pool} in England for ${meta.label}${hasLa ? ` and ${ord(Number(r.la_rank))} of ${Number(r.la_of_n).toLocaleString('en-GB')} in ${la}` : ''}.`,
      yearText: meta.yearText(r), sourceShort: meta.srcShort, source: SRC[meta.src],
      valueText: v != null ? `${meta.fmt(v)}${meta.value ? ' ' + meta.value : ''}` : '',
      note: `1st means the ${meta.top}.`, caveat: meta.caveat ?? '',
    });
    if (rows.length >= MAX_RANK_ROWS) break;
  }
  return rows;
}
export const RANK_METHOD = 'Each ranking compares only state-funded schools with a published figure for that measure. The number of schools therefore differs between rows. Independent schools, special schools, nursery schools, alternative provision and 16 to 19 providers are not ranked. Each row states whether rank 1 is the highest or the lowest figure. Schools with the same figure share a rank and the next rank is skipped. Council rankings appear only where at least 10 schools in the council have a figure. Rankings describe the published figures and do not explain why schools differ.';

/** Copy-ready plain-text citation. `accessed` is passed in so the caller renders it at request time. */
export function citationText(s: any, rows: RankRow[], hasOfsted: boolean, accessed: string): string {
  const years = new Map<string, string[]>();
  for (const r of rows) { const a = years.get(r.sourceShort) ?? []; if (!a.includes(r.yearText)) a.push(r.yearText); years.set(r.sourceShort, a); }
  const parts = [...years].map(([k, y]) => `${k} (${y.join(', ')})`);
  if (hasOfsted) parts.push('Ofsted Management Information, state-funded schools inspections and outcomes (inspections to 30 September 2026)');
  return `${s.name}, ${s.town}. School data and rankings, catchment.school. https://catchment.school/school/${s.slug}/\nSources: ${parts.join('; ')}.\nAccessed ${accessed}.`;
}

// ---------- formatting ----------
export const num = (v: any): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const pct1 = (v: any) => { const n = num(v); return n == null ? null : `${n.toFixed(1)}%`; };
export const f1 = (v: any) => { const n = num(v); return n == null ? null : n.toFixed(1); };
export const f2 = (v: any) => { const n = num(v); return n == null ? null : n.toFixed(2); };
export const int = (v: any) => { const n = num(v); return n == null ? null : n.toLocaleString('en-GB'); };
export const gbp = (v: any) => { const n = num(v); return n == null ? null : `£${Math.round(n).toLocaleString('en-GB')}`; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** dd/mm/yyyy to "12 June 2024" */
export function longDate(d: string | null | undefined): string | null {
  const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(d ?? '');
  return m ? `${+m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}` : null;
}
const ts = (d: string | null | undefined) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(d ?? ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0; };
export const yearOf = (d: string | null | undefined) => (d ? String(d).split('/').pop() ?? null : null);

export const isSpecialLike = (s: any) =>
  s.phase === 'Special' || s.phase === 'Nursery' || /special|pupil referral|alternative provision|hospital/i.test(String(s.type ?? ''));

// ---------- Ofsted ----------
export const GRADE_LABELS: Record<string, string> = { '1': 'Outstanding', '2': 'Good', '3': 'Requires improvement', '4': 'Inadequate' };
const CARD_GRADE: Record<number, { label: string; cls: string }> = {
  1: { label: 'Exceptional', cls: 'bg-green-100 text-green-900 border-green-300' },
  2: { label: 'Strong standard', cls: 'bg-green-50 text-green-900 border-green-300' },
  3: { label: 'Expected standard', cls: 'bg-blue-50 text-blue-900 border-blue-300' },
  4: { label: 'Needs attention', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  5: { label: 'Urgent improvement', cls: 'bg-red-100 text-red-900 border-red-300' },
};
const CARD_AREAS: [string, string][] = [
  ['sg', 'Safeguarding standards'], ['inc', 'Inclusion'], ['cur', 'Curriculum and teaching'], ['ach', 'Achievement'],
  ['att', 'Attendance and behaviour'], ['pdw', 'Personal development and wellbeing'], ['ey', 'Early years'],
  ['p16', 'Post-16 provision'], ['lg', 'Leadership and governance'],
];

export function ofstedView(o: any | null, urn: string) {
  if (!o) return null;
  let rc: Record<string, number> | null = null;
  try { rc = o.rc ? JSON.parse(o.rc) : null; } catch { rc = null; }
  const areas = rc ? CARD_AREAS.filter(([k]) => rc![k] != null).map(([k, label]) => {
    const v = rc![k];
    return k === 'sg'
      ? { key: k, label, text: v === 1 ? 'Met' : 'Not met', cls: v === 1 ? 'bg-green-100 text-green-900 border-green-300' : 'bg-red-100 text-red-900 border-red-300' }
      : { key: k, label, text: CARD_GRADE[v]?.label ?? String(v), cls: CARD_GRADE[v]?.cls ?? '' };
  }) : [];
  const rating = o.rating && GRADE_LABELS[o.rating] ? o.rating : null;
  const cardLater = areas.length > 0 && (!rating || ts(o.rcd) > ts(o.rdate));
  return {
    rating, ratingLabel: rating ? GRADE_LABELS[rating] : null, gradedDate: o.rdate ?? null, gradedYear: yearOf(o.rdate),
    predecessor: !!o.gx,
    ungraded: o.ud && o.uo ? { date: o.ud, outcome: String(o.uo) } : null,
    card: areas.length ? { date: o.rcd, areas } : null, cardLater,
    ungradedAfterCard: !!o.ud && ts(o.ud) > ts(o.rcd),
    // The latest inspection of any kind, as dd/mm/yyyy.
    latestDate: [o.rdate, o.ud, areas.length ? o.rcd : null].filter(Boolean).sort((a: string, b: string) => ts(b) - ts(a))[0] ?? null,
    reportUrl: `https://reports.ofsted.gov.uk/provider/${o.ot ?? 21}/${urn}`,
  };
}

// ---------- Admissions ----------
export const ENTRY_LABEL: Record<string, string> = { R: 'Reception', '7': 'Year 7', '9': 'Year 9' };
export function admissionsByEntry(adm: any[]) {
  const by: Record<string, any[]> = {};
  for (const r of adm) (by[r.entry] ??= []).push(r);
  return Object.entries(by)
    .map(([entry, rows]) => ({ entry, label: ENTRY_LABEL[entry] ?? `Year ${entry}`, rows: rows.sort((a, b) => (a.year < b.year ? -1 : 1)).slice(-3) }))
    .filter((g) => g.rows.some((r) => num(r.first_pref) != null || num(r.offers_total) != null))
    .sort((a, b) => (a.entry === 'R' ? -1 : b.entry === 'R' ? 1 : a.entry < b.entry ? -1 : 1));
}
/** Plain sentences about the latest year. Leads with the share of first-choice families offered a place, then DfE's first preferences per offer. */
export const ALL_THROUGH_Y7_NOTE = 'This school also admits at Reception, so its Year 7 offers leave out pupils moving up from its own primary. Demand per offer looks higher than it is.';
export function admissionsReading(name: string, label: string, r: any, allThroughY7 = false): string | null {
  const fp = num(r.first_pref), off = num(r.offers_total), ratio = num(r.first_pref_per_offer), pc = num(r.pct_first_pref_offered);
  if (fp == null || off == null) return null;
  const fpT = fp.toLocaleString('en-GB'), offT = off.toLocaleString('en-GB');
  let t = pc != null
    ? `${pc.toFixed(1)}% of the ${fpT} families who put ${name} first for ${label} entry in ${r.year} were offered a place on offer day. The school made ${offT} ${off === 1 ? 'offer' : 'offers'} in total.`
    : `${fpT} ${fp === 1 ? 'family' : 'families'} put ${name} first for ${label} entry in ${r.year} and the school made ${offT} ${off === 1 ? 'offer' : 'offers'}.`;
  if (allThroughY7) return `${t} ${ALL_THROUGH_Y7_NOTE}`;
  if (ratio != null) t += ` That is ${ratio.toFixed(2)} first preferences per offer. DfE counts a figure above 1 as oversubscribed. ${name} was ${ratio > 1 ? '' : 'not '}oversubscribed on first preferences.`;
  const oo = num(r.offers_other_la);
  if (oo != null && off > 0) t += ` ${oo.toLocaleString('en-GB')} of the ${offT} offers went to children living in another council area.`;
  return t;
}

// ---------- Destinations ----------
export function destinationsByStage(dest: any[]) {
  const mk = (stage: string, label: string) => ({
    stage, label,
    rows: dest.filter((r) => r.stage === stage).sort((a, b) => (a.cohort < b.cohort ? -1 : 1)).slice(-3),
  });
  return [mk('ks4', 'After Year 11 (key stage 4)'), mk('1618', 'After sixth form (age 16 to 18)')].filter((g) => g.rows.some((r) => num(r.sustained) != null));
}
export const cohortLabel = (r: any) => `${r.cohort}${r.status === 'Provisional' ? ' (provisional)' : ''}`;

// ---------- School facts ----------
export const SEND_NEEDS: Record<string, string> = {
  asd: 'Autistic spectrum disorder', slcn: 'Speech, language and communication needs', semh: 'Social, emotional and mental health needs',
  spld: 'Specific learning difficulty', mld: 'Moderate learning difficulty', sld: 'Severe learning difficulty',
  pmld: 'Profound and multiple learning difficulty', hi: 'Hearing impairment', vi: 'Visual impairment', msi: 'Multi-sensory impairment',
  pd: 'Physical disability', oth: 'Other difficulty or disability',
};
/** Spending per pupil shown only for mainstream-type schools and plausible values (GBP 3,000 to 30,000). */
export function financeShown(s: any, f: any | null) {
  const tot = num(f?.fin_total_exp_per_pupil);
  if (tot == null || isSpecialLike(s) || tot < 3000 || tot > 30000) return null;
  const teach = num(f?.fin_teaching_per_pupil);
  return { total: tot, teaching: teach != null && teach >= 1000 && teach < tot ? teach : null };
}
export function workforceShown(f: any | null) {
  if (!f || f.wf_year == null) return null;
  const ptr = num(f.wf_ptr), qts = num(f.wf_qts_pct), vac = num(f.wf_vacancy_rate), left = num(f.wf_left_school_pct), fte = num(f.wf_fte_teachers);
  if (ptr == null && qts == null && vac == null && left == null) return null;
  return { ptr: ptr != null && ptr > 0 ? ptr : null, qts, vac, left, fte, small: fte != null && fte < 10 };
}
export function sendShown(f: any | null) {
  if (!f) return null;
  const sup = num(f.send_support_pct), ehc = num(f.send_ehc_pct);
  const top = f.send_top_need && SEND_NEEDS[f.send_top_need] ? { label: SEND_NEEDS[f.send_top_need], pct: num(f.send_top_need_pct) } : null;
  const rp = f.prov_has_rp ? { onRoll: num(f.prov_rp_on_roll), capacity: num(f.prov_rp_capacity) } : null;
  const unit = f.prov_has_unit ? { onRoll: num(f.prov_unit_on_roll), capacity: num(f.prov_unit_capacity) } : null;
  if (sup == null && ehc == null && !rp && !unit) return null;
  return { sup, ehc, top, rp, unit, provType: f.prov_type ?? null, needs: f.prov_needs ?? null };
}

// Source lines (all dates are from the *-sources.json files).
export const SRC = {
  admissions: 'DfE, Primary and secondary school applications and offers, academic year 2026/27 release (published 18 June 2026), school level file, downloaded 30 October 2026',
  destinations: 'DfE, Key stage 4 and 16 to 18 destination measures, data set version 2.0 (released 15 October 2026), downloaded 30 October 2026',
  workforce: 'DfE, School workforce in England, reporting year 2025 (November 2025 school workforce census), downloaded 30 October 2026',
  cfr: 'DfE Schools financial benchmarking, Consistent Financial Reporting for council maintained schools, financial year 2025-26',
  aar: 'DfE Schools financial benchmarking, Academies Accounts Return, academy year September 2024 to August 2025',
  send: 'DfE, Special educational needs in England, academic year 2025/26 (January 2026 school census)',
  ks4: 'DfE, Key stage 4 performance (school-level performance tables data, provisional for 2025/26), downloaded 30 October 2026',
  ks4final: 'DfE, Key stage 4 performance, academic year 2025/26 release (school-level data set version 2.0.1; 2023/24 and 2024/25 figures are final), downloaded 30 October 2026',
  absence: 'DfE, Pupil absence in schools in England, academic year 2024/25 (published 26 March 2026), downloaded 30 October 2026',
  provision: 'Get Information About Schools, as at 30 October 2026',
  ofsted: 'Ofsted Management Information, state-funded schools inspections and outcomes, latest inspections to 30 September 2026 (grades before 2019 from the 31 December 2025 release)',
};

// ================= Compare page =================
type Cell = { text: string | null; yr?: string | null };
export type CRow = { label: string; src: string; a: Cell; b: Cell; na?: number | null; nb?: number | null; better?: 'high' | 'low'; tol?: number; note?: string; sameYr?: boolean; winner?: 'a' | 'b' | null };
type Group = { title: string; note?: string; rows: CRow[] };
const cell = (text: string | null, yr: string | null = null): Cell => ({ text, yr });

/** Latest year (key) where both schools have a value, else each school's own latest. */
function pickYear<T>(ra: T[], rb: T[], key: (r: T) => string, val: (r: T) => number | null) {
  const ma = new Map(ra.filter((r) => val(r) != null).map((r) => [key(r), r]));
  const mb = new Map(rb.filter((r) => val(r) != null).map((r) => [key(r), r]));
  const both = [...ma.keys()].filter((k) => mb.has(k)).sort();
  if (both.length) { const k = both[both.length - 1]; return { same: true, a: ma.get(k)!, b: mb.get(k)!, ya: k, yb: k }; }
  const la = [...ma.keys()].sort().pop(), lb = [...mb.keys()].sort().pop();
  return { same: false, a: la ? ma.get(la)! : null, b: lb ? mb.get(lb)! : null, ya: la ?? null, yb: lb ?? null };
}

function dataRow<T>(label: string, srcName: string, ra: T[], rb: T[], key: (r: T) => string, keyLabel: (r: T) => string, field: (r: T) => any, fmt: (v: any) => string | null, opts: { better?: 'high' | 'low'; tol?: number; note?: string } = {}): CRow {
  const p = pickYear(ra, rb, key, (r) => num(field(r)));
  const va = p.a ? num(field(p.a)) : null, vb = p.b ? num(field(p.b)) : null;
  const yrA = p.a ? keyLabel(p.a) : null, yrB = p.b ? keyLabel(p.b) : null;
  return {
    label, ...opts, na: va, nb: vb, sameYr: p.same,
    src: `${srcName}${p.same && yrA ? `, ${yrA}` : ''}`,
    a: cell(fmt(va), p.same ? null : yrA), b: cell(fmt(vb), p.same ? null : yrB),
  };
}
const hasAny = (rows: CRow[]) => rows.some((r) => r.a.text != null || r.b.text != null);

export function buildCompareExtras(A: any, B: any, dA: SchoolData, dB: SchoolData, group: 'primary' | 'secondary') {
  const groups: Group[] = [];
  const sources: string[] = [];
  const sums: string[] = [];
  const ofGroups: Group[] = [];

  // ---- Ofsted detail rows ----
  const vA = ofstedView(dA.ofsted, A.urn), vB = ofstedView(dB.ofsted, B.urn);
  const ung = (v: any) => (v?.ungraded ? `${v.ungraded.outcome}, ${longDate(v.ungraded.date)}` : null);
  const ofRows: CRow[] = [];
  if (vA?.ungraded || vB?.ungraded) ofRows.push({ label: 'Latest ungraded inspection', src: 'Ofsted MI, inspections to 30 September 2026', a: cell(ung(vA)), b: cell(ung(vB)), note: 'Ungraded inspections do not give a new grade. They report whether the previous grade still holds.' });
  if (vA?.predecessor || vB?.predecessor) ofRows.push({ label: 'School the overall grade was awarded to', src: 'Ofsted MI, inspections to 30 September 2026', a: cell(vA ? (vA.predecessor ? 'A predecessor school on this site, for example before academy conversion' : vA.rating ? 'This school' : null) : null), b: cell(vB ? (vB.predecessor ? 'A predecessor school on this site, for example before academy conversion' : vB.rating ? 'This school' : null) : null), note: 'Ofsted does not name the predecessor in its management information.' });
  if (vA?.card || vB?.card) {
    const ofsrc = 'Ofsted report card';
    ofRows.push({ label: 'Report card inspection date', src: ofsrc, a: cell(vA?.card ? longDate(vA.card.date) : 'No report card yet'), b: cell(vB?.card ? longDate(vB.card.date) : 'No report card yet'), note: 'Report cards began in November 2025 and give grades by area, with no overall grade.' });
    for (const [k, label] of CARD_AREAS) {
      const get = (v: any) => v?.card?.areas.find((x: any) => x.key === k)?.text ?? null;
      const ga = get(vA), gb = get(vB);
      if (ga || gb) ofRows.push({ label, src: ofsrc, a: cell(ga), b: cell(gb) });
    }
  }
  if (ofRows.length) ofGroups.push({ title: 'Ofsted detail', note: 'Not marked as stronger or weaker. A report card cannot be compared with an older overall grade.', rows: ofRows });

  // ---- Admissions demand ----
  const entry = group === 'secondary' ? '7' : 'R';
  const entryName = ENTRY_LABEL[entry];
  const aa = dA.adm.filter((r) => r.entry === entry), ab = dB.adm.filter((r) => r.entry === entry);
  const atY7 = entry === '7' && (dA.adm.some((r) => r.entry === 'R') || dB.adm.some((r) => r.entry === 'R'));
  const admSrc = 'DfE applications and offers';
  const ak = (r: any) => r.year;
  const admRows: CRow[] = [
    dataRow(`First preferences for ${entryName} places`, admSrc, aa, ab, ak, ak, (r) => r.first_pref, int),
    dataRow('Offers made on offer day', admSrc, aa, ab, ak, ak, (r) => r.offers_total, int),
    dataRow('First-choice applicants offered a place', admSrc, aa, ab, ak, ak, (r) => r.pct_first_pref_offered, pct1),
    dataRow('First preferences per offer', admSrc, aa, ab, ak, ak, (r) => r.first_pref_per_offer, f2, { note: 'Above 1 means more first preferences than offers, which DfE reads as oversubscribed.' }),
  ];
  const trend = (rows: any[]) => {
    const rs = rows.filter((r) => num(r.first_pref) != null).sort((x, y) => (x.year < y.year ? -1 : 1)).slice(-3);
    return rs.length ? { text: rs.map((r) => int(r.first_pref)).join(', '), yr: rs.map((r) => r.year).join(', ') } : null;
  };
  const tA = trend(aa), tB = trend(ab);
  if (tA || tB) admRows.push({ label: 'First preferences, oldest year to latest', src: admSrc, a: cell(tA?.text ?? null, tA?.yr ?? null), b: cell(tB?.text ?? null, tB?.yr ?? null) });
  if (hasAny(admRows)) {
    groups.push({ title: `Admissions demand (${entryName} entry)`, note: 'Offer day figures only, so appeals and waiting lists are not counted. Offers are not the same as capacity. DfE does not publish a last distance offered nationally. Not marked as stronger or weaker: higher demand is not a measure of quality.' + (atY7 ? ' At least one of these schools also admits at Reception, so its Year 7 offers leave out pupils moving up from its own primary.' : ''), rows: admRows });
    sources.push(`${SRC.admissions}.`);
    const p = pickYear(aa, ab, ak, (r) => num(r.first_pref));
    if (p.same && p.a && p.b && num(p.a.offers_total) != null && num(p.b.offers_total) != null) {
      sums.push(`For ${entryName} entry in ${p.ya}, ${A.name} had ${int(p.a.first_pref)} first preferences and made ${int(p.a.offers_total)} offers on offer day. ${B.name} had ${int(p.b.first_pref)} first preferences and made ${int(p.b.offers_total)} offers.`);
      const ra = num(p.a.first_pref_per_offer), rb = num(p.b.first_pref_per_offer);
      if (!atY7 && ra != null && rb != null && Math.abs(ra - rb) >= 0.2) {
        const hiA = ra > rb;
        sums.push(`${hiA ? A.name : B.name} had more first preferences per offer (${f2(Math.max(ra, rb))} against ${f2(Math.min(ra, rb))}).`);
      }
    }
  }

  // ---- Destinations (secondary comparisons only) ----
  if (group === 'secondary') {
    const mk = (stage: string, label: string, field: string, fmtLabel: string, srcName: string, other: boolean) => {
      const ra = dA.dest.filter((r) => r.stage === stage), rb = dB.dest.filter((r) => r.stage === stage);
      return dataRow(fmtLabel, srcName, ra, rb, (r) => r.cohort, cohortLabel, (r) => r[field], pct1);
    };
    const dRows: CRow[] = [
      mk('ks4', '', 'sustained', 'Year 11 leavers in a sustained destination', 'DfE KS4 destinations', false),
      mk('ks4', '', 'education', 'Year 11 leavers in education', 'DfE KS4 destinations', false),
      mk('ks4', '', 'apprenticeship', 'Year 11 leavers in an apprenticeship', 'DfE KS4 destinations', false),
      mk('1618', '', 'sustained', 'Sixth form leavers in a sustained destination', 'DfE 16 to 18 destinations', false),
      mk('1618', '', 'he', 'Sixth form leavers in higher education', 'DfE 16 to 18 destinations', false),
      mk('1618', '', 'apprenticeship', 'Sixth form leavers in an apprenticeship', 'DfE 16 to 18 destinations', false),
      mk('1618', '', 'employment', 'Sixth form leavers in employment', 'DfE 16 to 18 destinations', false),
    ].filter((r) => r.a.text != null || r.b.text != null);
    if (dRows.length) {
      groups.push({ title: 'Where pupils go next', note: 'Percentages of each leaver cohort. Sustained means at least two terms in education, an apprenticeship or employment. Not marked as stronger or weaker: destinations reflect each school\'s intake as well as its teaching.', rows: dRows });
      sources.push(`${SRC.destinations}.`);
    }
  }

  // ---- Staff and spending ----
  const fA = dA.facts, fB = dB.facts;
  const wA = workforceShown(fA), wB = workforceShown(fB);
  const one = (f: any) => (f ? [f] : []);
  const wfSrc = 'DfE school workforce, 2025/26';
  const wfRow = (label: string, field: string, fmt: (v: any) => string | null, better?: 'high' | 'low', tol = 0, note?: string): CRow => {
    const ok = (w: any) => w && !w.small;
    const row = dataRow(label, wfSrc, wA ? one(fA) : [], wB ? one(fB) : [], () => 'wf', () => '2025/26', (f) => f[field], fmt, {});
    row.sameYr = true; row.src = wfSrc; row.a.yr = null; row.b.yr = null; if (note) row.note = note;
    if (better && ok(wA) && ok(wB)) { row.better = better; row.tol = tol; }
    return row;
  };
  const staffRows: CRow[] = [
    wfRow('Pupils per teacher', 'wf_ptr', f1),
    wfRow('Qualified teachers (QTS)', 'wf_qts_pct', pct1, 'high', 5, 'Share of full-time-equivalent teachers with qualified teacher status.'),
    wfRow('Teacher vacancy rate', 'wf_vacancy_rate', pct1, 'low', 2),
    wfRow('Teachers who left the school in a year', 'wf_left_school_pct', pct1, undefined, 0, 'Teachers in post in November 2024 who were no longer at the school in November 2025.'),
  ];
  const finA = financeShown(A, fA), finB = financeShown(B, fB);
  const finRow = (label: string, g: (x: any) => number | null | undefined): CRow => ({
    label, src: 'DfE financial benchmarking', sameYr: false,
    a: cell(gbp(finA ? g(finA) : null), finA ? `${fA.fin_year}${fA.fin_source === 'AAR' ? ' (academy)' : ' (council maintained)'}` : null),
    b: cell(gbp(finB ? g(finB) : null), finB ? `${fB.fin_year}${fB.fin_source === 'AAR' ? ' (academy)' : ' (council maintained)'}` : null),
    note: 'Revenue spending only, not capital. Council maintained schools and academies are not like for like: academy figures leave out the trust\'s central spending and cover a different year.',
  });
  const spendRows: CRow[] = [finRow('Total spending per pupil', (x) => x.total), finRow('Teaching staff spending per pupil', (x) => x.teaching)];
  const staffAll = [...staffRows, ...spendRows].filter((r) => r.a.text != null || r.b.text != null);
  if (staffAll.length) {
    groups.push({ title: 'Staff and spending', note: '"Stronger" is used only for the qualified teacher share and the teacher vacancy rate, and only when both schools have at least 10 full-time-equivalent teachers. Pupils per teacher, staff turnover and spending are not marked: a higher or lower figure is not clearly better.', rows: staffAll });
    if (staffRows.some((r) => r.a.text != null || r.b.text != null)) sources.push(`${SRC.workforce}.`);
    if (spendRows.some((r) => r.a.text != null || r.b.text != null)) {
      sources.push(`${[fA?.fin_source === 'AAR' || fB?.fin_source === 'AAR' ? SRC.aar : null, fA?.fin_source === 'CFR' || fB?.fin_source === 'CFR' ? SRC.cfr : null].filter(Boolean).join('; ')}. Spending per pupil is left out for special schools, nursery schools and alternative provision, and where the published figure falls outside £3,000 to £30,000 per pupil.`);
    }
  }

  // ---- SEND (unmarked) ----
  const sA = sendShown(fA), sB = sendShown(fB);
  const provText = (x: ReturnType<typeof sendShown>) => {
    if (!x || (!x.rp && !x.unit)) return null;
    const part = (n: string, p: any) => `${n}: ${p.onRoll != null ? `${p.onRoll} on roll` : 'on roll Not published'}${p.capacity != null ? `, capacity ${p.capacity}` : ''}`;
    return [x.rp ? part('Resourced provision', x.rp) : null, x.unit ? part('SEN unit', x.unit) : null].filter(Boolean).join('. ');
  };
  const sendRows: CRow[] = [
    { label: 'Pupils on SEN support', src: 'DfE SEN in England, 2025/26', a: cell(pct1(sA?.sup)), b: cell(pct1(sB?.sup)), note: 'Share of all pupils on roll.' },
    { label: 'Pupils with an EHC plan', src: 'DfE SEN in England, 2025/26', a: cell(pct1(sA?.ehc)), b: cell(pct1(sB?.ehc)), note: 'Share of all pupils on roll.' },
    { label: 'Most common type of need', src: 'DfE SEN in England, 2025/26', a: cell(sA?.top ? `${sA.top.label}${sA.top.pct != null ? ` (${sA.top.pct.toFixed(0)}% of pupils with SEN)` : ''}` : null), b: cell(sB?.top ? `${sB.top.label}${sB.top.pct != null ? ` (${sB.top.pct.toFixed(0)}% of pupils with SEN)` : ''}` : null) },
    { label: 'Specialist provision on site', src: 'GIAS, 30 October 2026', a: cell(provText(sA)), b: cell(provText(sB)) },
  ].filter((r) => r.a.text != null || r.b.text != null);
  if (sendRows.length) {
    groups.push({ title: 'SEND support', note: 'Not marked as stronger or weaker. These rows describe who a school supports and what provision it has. They are not a measure of quality.', rows: sendRows });
    sources.push(`${SRC.send}; ${SRC.provision}.`);
  }

  return { groups, ofGroups, sources, sums };
}
