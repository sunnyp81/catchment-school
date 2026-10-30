// Staff, money and SEND facts per school (DfE EES school workforce, EES SEN school level, FBIT CFR + AAR, GIAS).
// Writes data/schoolfacts.json, data/schoolfacts.sql, scripts/d1-schoolfacts.sql, src/data/schoolfacts-sources.json.
// Run: node scripts/fetch-schoolfacts.mjs [--no-download]   (xlsx -> csv conversion shells out to `python -I` + openpyxl)
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { spawnSync } from 'child_process';
import { parse } from 'csv-parse';

const CMS = 'https://content.explore-education-statistics.service.gov.uk/api/data-set-files';
const FBIT = 'https://financial-benchmarking-and-insights-tool.education.gov.uk/files';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const WF_YEAR = '202526', TURN_YEAR = '202425';

const FILES = {
  ptr: { path: 'data/dfe/wf_ptr_sch.csv', url: `${CMS}/d5f1867a-ca93-454d-9361-6c64df108872/download` },
  fte: { path: 'data/dfe/wf_fte_sch.csv', url: `${CMS}/cce5e2fe-b6eb-4741-9199-21afa08fb97a/download` },
  tch: { path: 'data/dfe/wf_teachchar_sch.csv', url: `${CMS}/15fca977-837e-4a82-8e24-bd9ee9fb5515/download` },
  turn: { path: 'data/dfe/wf_turnover_sch.csv', url: `${CMS}/a92cdbbb-5596-4b1c-a169-b350461c5294/download` },
  vac: { path: 'data/dfe/wf_vacancies_sch.csv', url: `${CMS}/e70db0c4-e346-413b-a238-05a81a6087a9/download` },
  sen: { path: 'data/dfe/sen_school.csv', url: `${CMS}/c5490fd8-6cf3-469e-9f60-0b4262134cb5/download` },
  cfrX: { path: 'data/dfe/CFR_2025-26_Full_Data_Workbook.xlsx', url: `${FBIT}/CFR_2025-26_Full_Data_Workbook.xlsx` },
  aarX: { path: 'data/dfe/AAR_2024-25_download.xlsx', url: `${FBIT}/AAR_2024-25_download.xlsx` },
  gias: { path: 'data/dfe/edubasealldata.csv', url: null }, // date-stamped, resolved in downloadGias()
};
const CFR_CSV = 'data/dfe/cfr_2025-26.csv';
const AAR_CSV = 'data/dfe/aar_2024-25.csv';

const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null; // c, z, x, u, NA, n/s, n/a, SUPP, '' -> null
  return Number(s);
};
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const pct = (a, b) => (a === null || b === null || b <= 0 ? null : r1((100 * a) / b));
const yr = (p) => `${p.slice(0, 4)}/${p.slice(4)}`;
const bad = {}; // non-numeric token tally per field, for the report
const numT = (v, field) => {
  const n = num(v);
  if (n === null) { const k = `${field}:${String(v ?? '').trim() || '(blank)'}`; bad[k] = (bad[k] || 0) + 1; }
  return n;
};

async function download(f, headers = {}) {
  mkdirSync('data/dfe', { recursive: true });
  const res = await fetch(f.url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${f.url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(f.path));
  if (statSync(f.path).size < 10000) throw new Error(`suspiciously small download: ${f.path}`);
}
async function downloadGias() {
  const f = FILES.gias;
  for (let back = 0; back < 7; back++) {
    const d = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${d}.csv`;
    const res = await fetch(url);
    if (!res.ok) continue;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(f.path));
    return { url, stamp: d };
  }
  throw new Error('GIAS edubasealldata not found for last 7 days');
}

async function rows(path, onRow, encoding = 'utf8') {
  const p = createReadStream(path, { encoding: encoding === 'utf8' ? undefined : encoding })
    .pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true, bom: true }));
  for await (const r of p) onRow(r);
}

const PY = `
import sys, csv, openpyxl
src, sheet, out, skip = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
wb = openpyxl.load_workbook(src, read_only=True)
with open(out, 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh)
    for i, r in enumerate(wb[sheet].iter_rows(values_only=True)):
        if i < skip: continue
        w.writerow(['' if c is None else c for c in r])
`;
function xlsxToCsv(src, sheet, out, skip) {
  const r = spawnSync('python', ['-I', '-', src, sheet, out, String(skip)], { input: PY, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`xlsx convert failed ${src}: ${r.stderr}`);
}

const facts = {}; // urn -> {workforce, finance, send, provision}
const g = (urn, k) => ((facts[urn] ??= {})[k] ??= {});
const diag = {};

// ---------------- workforce ----------------
async function loadWorkforce() {
  const ptr = {}, fte = {}, qts = {}, vac = {}, turn = {};
  await rows(FILES.ptr.path, (r) => {
    if (r.time_period !== WF_YEAR) return;
    ptr[r.school_urn] = {
      ptr: numT(r.pupil_to_qual_unqual_teacher_ratio, 'ptr'),
      ptr_qualified: numT(r.pupil_to_qual_teacher_ratio, 'ptr_qualified'),
      pupil_adult_ratio: numT(r.pupil_to_adult_ratio, 'pupil_adult_ratio'),
    };
  });
  await rows(FILES.fte.path, (r) => {
    if (r.time_period !== WF_YEAR) return;
    const all = numT(r.fte_all_teachers, 'fte_all_teachers');
    const noq = numT(r.fte_all_teachers_without_qts, 'fte_without_qts');
    fte[r.school_urn] = {
      fte_teachers: all,
      fte_teaching_assistants: numT(r.fte_teaching_assistants, 'fte_ta'),
      qts_pct_fteFile: all && noq !== null && all > 0 ? r1(100 - (100 * noq) / all) : null,
    };
  });
  await rows(FILES.tch.path, (r) => {
    if (r.time_period !== WF_YEAR) return;
    // Every dimension "Total" except qts_status = Qualified (on_route Total, so no unqualified route rows slip in).
    if (r.grade !== 'Total' || r.sex !== 'Total' || r.age_group !== 'Total' || r.working_pattern !== 'Total'
      || r.qts_status !== 'Qualified' || r.on_route !== 'Total' || r.ethnicity_major !== 'Total') return;
    qts[r.school_urn] = r1(numT(r.fte_school_percent, 'qts_pct'));
  });
  await rows(FILES.vac.path, (r) => {
    if (r.time_period !== WF_YEAR) return;
    vac[r.school_urn] = { vacancies: numT(r.vacancy, 'vacancies'), vacancy_rate: numT(r.rate, 'vacancy_rate') };
  });
  let sumMismatch = 0;
  await rows(FILES.turn.path, (r) => {
    if (r.time_period !== TURN_YEAR) return;
    const t = numT(r.teacher_fte_in_census_year, 'turnover_fte');
    const stay = numT(r.remained_in_the_same_school, 'turnover_stay');
    const lsys = numT(r.left_the_state_funded_system, 'turnover_left_sys');
    const loth = numT(r.left_to_another_state_funded_school, 'turnover_left_other');
    if (t === null || stay === null || lsys === null || loth === null || t <= 0) { turn[r.school_urn] = null; return; }
    if (Math.abs(stay + lsys + loth - t) > 0.15) sumMismatch++;
    turn[r.school_urn] = { turnover_fte: t, left_school_pct: pct(lsys + loth, t), left_system_pct: pct(lsys, t) };
  });
  diag.turnoverSumMismatch = sumMismatch;
  const urns = new Set([...Object.keys(ptr), ...Object.keys(fte), ...Object.keys(qts), ...Object.keys(vac), ...Object.keys(turn)]);
  let qtsDiff = 0, qtsBoth = 0;
  for (const u of urns) {
    const p = ptr[u] || {}, f = fte[u] || {}, v = vac[u] || {}, t = turn[u];
    const q = qts[u] ?? f.qts_pct_fteFile ?? null;
    if (qts[u] != null && f.qts_pct_fteFile != null) { qtsBoth++; if (Math.abs(qts[u] - f.qts_pct_fteFile) > 0.2) qtsDiff++; }
    const w = {
      year: yr(WF_YEAR),
      ptr: p.ptr ?? null, ptr_qualified: p.ptr_qualified ?? null, pupil_adult_ratio: p.pupil_adult_ratio ?? null,
      fte_teachers: f.fte_teachers ?? null, fte_teaching_assistants: f.fte_teaching_assistants ?? null,
      qts_pct: q,
      vacancies: v.vacancies ?? null, vacancy_rate: v.vacancy_rate ?? null,
      turnover_year: t ? yr(TURN_YEAR) : null,
      left_school_pct: t ? t.left_school_pct : null, left_system_pct: t ? t.left_system_pct : null,
    };
    Object.assign(g(u, 'workforce'), w);
  }
  diag.qtsCrossCheck = { compared: qtsBoth, differBy0_2pp: qtsDiff };
}

// ---------------- finance ----------------
const col = (hdr, re) => hdr.find((h) => re.test(h));
async function loadFinance() {
  if (!existsSync(CFR_CSV) || process.argv.includes('--reconvert')) xlsxToCsv(FILES.cfrX.path, 'CFR Data', CFR_CSV, 0);
  if (!existsSync(AAR_CSV) || process.argv.includes('--reconvert')) xlsxToCsv(FILES.aarX.path, 'Academies', AAR_CSV, 1);
  const out = {};
  const fin = { cfr: { rows: 0, used: 0, dns: 0, partial: 0, federated: 0, fedMembersFilled: 0 }, aar: { rows: 0, urns: 0, used: 0, dupUrns: 0, dupSummed12: 0, partial: 0, noFinance: 0 } };

  // CFR (LA maintained), financial year 2025-26
  const cfr = [];
  let h;
  await rows(CFR_CSV, (r) => {
    if (!h) h = Object.keys(r);
    cfr.push(r);
  });
  const cPup = col(h, /^No pupils/), cTot = col(h, /^Total Expenditure/), cTeach = col(h, /^(E01 Teaching staff|Teaching Staff E01)$/i);
  const cMon = col(h, /^Period covered/), cDns = col(h, /^Did Not Supply/), cFed = col(h, /^Federated submission/);
  const cLead = h.filter((x) => /^Lead school in federation/.test(x))[0];
  const cLaestab = col(h, /^LAEstab$/);
  const cfrByLaestab = {};
  for (const r of cfr) {
    fin.cfr.rows++;
    const pupils = num(r[cPup]), tot = num(r[cTot]), teach = num(r[cTeach]), months = num(r[cMon]);
    const dns = r[cDns] === 'Y';
    if (dns) fin.cfr.dns++;
    if (months !== null && months < 12) fin.cfr.partial++;
    const ok = !dns && months === 12 && pupils > 0 && tot > 0 && teach !== null;
    const rec = ok ? { total_pp: Math.round(tot / pupils), teaching_pp: Math.round(teach / pupils), pupils: r1(pupils), months, basis: r[cFed] === 'Lead school' ? 'federation' : 'school', source: 'CFR' } : null;
    if (r[cFed] === 'Lead school') fin.cfr.federated++;
    cfrByLaestab[r[cLaestab]] = { rec, row: r };
    out[r.URN] = rec ? { ...rec } : null;
  }
  // federation members take the federation lead's pooled per-pupil figure, flagged basis = 'federation'
  for (const r of cfr) {
    if (!r[cDns] || r[cDns] !== 'Y') continue;
    const lead = r[cLead];
    if (lead && lead !== '0' && cfrByLaestab[lead]?.rec) { out[r.URN] = { ...cfrByLaestab[lead].rec, basis: 'federation' }; fin.cfr.fedMembersFilled++; }
  }
  fin.cfr.used = Object.values(out).filter(Boolean).length;

  // AAR (academies), academic year 2024/25. Group by URN so mid-year trust moves (two part-year rows) sum to one year.
  const aar = {};
  let ah;
  await rows(AAR_CSV, (r) => {
    if (!ah) ah = Object.keys(r);
    fin.aar.rows++;
    (aar[r.URN] ??= []).push(r);
  });
  const aPup = col(ah, /^Number of pupils in academy/), aTot = ah.find((x) => x === 'Total Expenditure' || /(^|\| )Total Expenditure$/.test(x));
  const aTeach = ah.find((x) => x === 'Teaching staff') ;
  const aMon = col(ah, /^Period covered/);
  const aarOut = {};
  for (const [urn, rs] of Object.entries(aar)) {
    fin.aar.urns++;
    if (rs.length > 1) fin.aar.dupUrns++;
    const months = rs.reduce((s, r) => s + (num(r[aMon]) || 0), 0);
    const totals = rs.map((r) => num(r[aTot]));
    const teachs = rs.map((r) => num(r[aTeach]));
    const pups = rs.map((r) => num(r[aPup])).filter((x) => x !== null);
    if (totals.some((x) => x === null) || teachs.some((x) => x === null) || !pups.length) { fin.aar.noFinance++; continue; }
    if (months !== 12) { fin.aar.partial++; continue; }
    const pupils = Math.max(...pups);
    if (!(pupils > 0)) continue;
    const tot = totals.reduce((a, b) => a + b, 0), teach = teachs.reduce((a, b) => a + b, 0);
    if (!(tot > 0)) { fin.aar.zeroSpend = (fin.aar.zeroSpend || 0) + 1; continue; } // zero total expenditure = no real return
    if (rs.length > 1) fin.aar.dupSummed12++;
    aarOut[urn] = { total_pp: Math.round(tot / pupils), teaching_pp: Math.round(teach / pupils), pupils: r1(pupils), months: 12, basis: rs.length > 1 ? 'academy, two part-year returns summed' : 'academy', source: 'AAR' };
  }
  fin.aar.used = Object.keys(aarOut).length;

  const all = new Set([...Object.keys(out), ...Object.keys(aarOut)]);
  for (const u of all) {
    const rec = out[u] || aarOut[u] || null; // CFR (newer, 12 months) wins when both are valid
    if (!rec) continue;
    Object.assign(g(u, 'finance'), {
      year: rec.source === 'CFR' ? '2025-26' : '2024/25',
      source: rec.source,
      period: rec.source === 'CFR' ? 'Financial year April 2025 to March 2026 (LA maintained school CFR return)' : 'Academy year September 2024 to August 2025 (academy accounts return)',
      months: rec.months, basis: rec.basis, pupils_fte: rec.pupils,
      total_exp_per_pupil: rec.total_pp, teaching_staff_per_pupil: rec.teaching_pp,
    });
  }
  diag.finance = fin;
}

// ---------------- SEND (school census, EES) ----------------
const NEEDS = { 'Specific learning difficulty': 'spld', 'Moderate learning difficulty': 'mld', 'Severe learning difficulty': 'sld', 'Profound and multiple learning difficulty': 'pmld', 'Social, emotional and mental health': 'semh', 'Speech, language and communications needs': 'slcn', 'Hearing impairment': 'hi', 'Vision impairment': 'vi', 'Multi-sensory impairment': 'msi', 'Physical disability': 'pd', 'Autistic spectrum disorder': 'asd', 'Other difficulty or disability': 'oth', 'SEN support but no specialist assessment of type of need': 'nsa' };
async function loadSend() {
  const S = {};
  let yearSeen = null;
  await rows(FILES.sen.path, (r) => {
    yearSeen = r.time_period;
    const a = (S[r.school_urn] ??= { total: null, supp: null, ehc: null, unit: null, rp: null, needs: {} });
    const n = numT(r.pupil_count, 'sen_count');
    const prov = r.sen_provision, need = r.sen_primary_need, unit = r.specialist_provision_unit_type;
    if (unit === 'SEN unit') { if (prov === 'All pupils' && need === 'All pupils') a.unit = n; return; }
    if (unit === 'Resourced provision') { if (prov === 'All pupils' && need === 'All pupils') a.rp = n; return; }
    if (need === 'All pupils') {
      if (prov === 'All pupils') a.total = n;
      else if (prov === 'SEN support') a.supp = n;
      else if (prov === 'Education, health and care plans') a.ehc = n;
    } else if (NEEDS[need]) {
      const k = NEEDS[need];
      (a.needs[k] ??= { supp: null, ehc: null })[prov === 'SEN support' ? 'supp' : 'ehc'] = n;
    }
  });
  const order = ['asd', 'slcn', 'semh', 'spld', 'mld', 'sld', 'pmld', 'hi', 'vi', 'msi', 'pd', 'oth'];
  let withData = 0;
  for (const [urn, a] of Object.entries(S)) {
    const senN = a.supp !== null && a.ehc !== null ? a.supp + a.ehc : null;
    const needsPct = {}; let top = null, topV = -1;
    for (const k of [...order, 'nsa']) {
      const x = a.needs[k]; if (!x || x.supp === null || x.ehc === null || !senN) continue;
      const v = x.supp + x.ehc; needsPct[k] = pct(v, senN);
      if (k !== 'nsa' && v > topV) { topV = v; top = k; }
    }
    const o = {
      year: yr(yearSeen), pupils: a.total,
      sen_support_pct: pct(a.supp, a.total), ehc_pct: pct(a.ehc, a.total),
      sen_total_pct: pct(senN, a.total),
      top_need: topV > 0 ? top : null, top_need_pct_of_sen: topV > 0 ? pct(topV, senN) : null,
      needs_pct_of_sen: Object.keys(needsPct).length ? needsPct : null,
      sen_unit_pupils: a.unit, resourced_provision_pupils: a.rp,
    };
    if (Object.values(o).some((v, i) => i > 0 && v !== null)) { Object.assign(g(urn, 'send'), o); withData++; }
  }
  diag.sendUrns = withData;
}

// ---------------- provision (GIAS) ----------------
async function loadProvision(asOf) {
  const nz = (v) => { const n = num(v); return n; };
  await rows(FILES.gias.path, (r) => {
    const t = (r['TypeOfResourcedProvision (name)'] || '').trim();
    const rpC = nz(r.ResourcedProvisionCapacity), rpR = nz(r.ResourcedProvisionOnRoll);
    const unC = nz(r.SenUnitCapacity), unR = nz(r.SenUnitOnRoll);
    const needs = [];
    for (let i = 1; i <= 13; i++) {
      const v = (r[`SEN${i} (name)`] || '').trim();
      if (v && !/^not applicable$/i.test(v)) needs.push(v.split(' - ')[0]);
    }
    const hasRp = /resourced provision/i.test(t) || (rpC ?? 0) > 0 || (rpR ?? 0) > 0;
    const hasUnit = /sen unit/i.test(t) || (unC ?? 0) > 0 || (unR ?? 0) > 0;
    if (!hasRp && !hasUnit && !needs.length) return;
    Object.assign(g(r.URN, 'provision'), {
      as_of: asOf,
      has_resourced_provision: hasRp ? 1 : 0, has_sen_unit: hasUnit ? 1 : 0,
      type: t && !/^not applicable$/i.test(t) ? t : null,
      resourced_provision_on_roll: rpR, resourced_provision_capacity: rpC,
      sen_unit_on_roll: unR, sen_unit_capacity: unC,
      needs_catered: needs.length ? needs : null,
    });
  }, 'latin1');
}

// ---------------- output ----------------
const COLS = [
  ['urn', 'TEXT PRIMARY KEY'],
  ['wf_year', 'TEXT'], ['wf_ptr', 'REAL'], ['wf_ptr_qualified', 'REAL'], ['wf_pupil_adult_ratio', 'REAL'],
  ['wf_fte_teachers', 'REAL'], ['wf_fte_teaching_assistants', 'REAL'], ['wf_qts_pct', 'REAL'],
  ['wf_vacancies', 'REAL'], ['wf_vacancy_rate', 'REAL'],
  ['wf_turnover_year', 'TEXT'], ['wf_left_school_pct', 'REAL'], ['wf_left_system_pct', 'REAL'],
  ['fin_year', 'TEXT'], ['fin_source', 'TEXT'], ['fin_months', 'INTEGER'], ['fin_basis', 'TEXT'], ['fin_pupils_fte', 'REAL'],
  ['fin_total_exp_per_pupil', 'INTEGER'], ['fin_teaching_per_pupil', 'INTEGER'],
  ['send_year', 'TEXT'], ['send_pupils', 'INTEGER'], ['send_support_pct', 'REAL'], ['send_ehc_pct', 'REAL'], ['send_total_pct', 'REAL'],
  ['send_top_need', 'TEXT'], ['send_top_need_pct', 'REAL'], ['send_needs_json', 'TEXT'],
  ['send_unit_pupils', 'INTEGER'], ['send_rp_pupils', 'INTEGER'],
  ['prov_as_of', 'TEXT'], ['prov_has_rp', 'INTEGER'], ['prov_has_unit', 'INTEGER'], ['prov_type', 'TEXT'],
  ['prov_rp_on_roll', 'INTEGER'], ['prov_rp_capacity', 'INTEGER'], ['prov_unit_on_roll', 'INTEGER'], ['prov_unit_capacity', 'INTEGER'],
  ['prov_needs', 'TEXT'],
];
function flat(urn, f) {
  const w = f.workforce || {}, fi = f.finance || {}, s = f.send || {}, p = f.provision || {};
  const nz = (v) => (v === undefined ? null : v);
  return [urn,
    nz(w.year), nz(w.ptr), nz(w.ptr_qualified), nz(w.pupil_adult_ratio), nz(w.fte_teachers), nz(w.fte_teaching_assistants), nz(w.qts_pct),
    nz(w.vacancies), nz(w.vacancy_rate), nz(w.turnover_year), nz(w.left_school_pct), nz(w.left_system_pct),
    nz(fi.year), nz(fi.source), nz(fi.months), nz(fi.basis), nz(fi.pupils_fte), nz(fi.total_exp_per_pupil), nz(fi.teaching_staff_per_pupil),
    nz(s.year), nz(s.pupils), nz(s.sen_support_pct), nz(s.ehc_pct), nz(s.sen_total_pct), nz(s.top_need), nz(s.top_need_pct_of_sen),
    s.needs_pct_of_sen ? JSON.stringify(s.needs_pct_of_sen) : null, nz(s.sen_unit_pupils), nz(s.resourced_provision_pupils),
    nz(p.as_of), nz(p.has_resourced_provision), nz(p.has_sen_unit), nz(p.type),
    nz(p.resourced_provision_on_roll), nz(p.resourced_provision_capacity), nz(p.sen_unit_on_roll), nz(p.sen_unit_capacity),
    p.needs_catered ? p.needs_catered.join('|') : null,
  ];
}
const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const skip = process.argv.includes('--no-download');
  let giasUrl = null;
  for (const [k, f] of Object.entries(FILES)) {
    if (k === 'gias') {
      if (!skip || !existsSync(f.path)) giasUrl = (await downloadGias()).url;
      continue;
    }
    if (!skip || !existsSync(f.path)) await download(f, k.endsWith('X') ? { 'User-Agent': UA } : {});
  }
  const mt = (p) => statSync(p).mtime.toISOString().slice(0, 10);
  const universe = new Set(JSON.parse(readFileSync('src/data/schools.json', 'utf8')).map((s) => String(s.urn)));

  await loadWorkforce();
  await loadFinance();
  await loadSend();
  await loadProvision(mt(FILES.gias.path));

  const json = {};
  for (const [urn, f] of Object.entries(facts)) if (universe.has(urn)) json[urn] = f;
  const urns = Object.keys(json).sort((a, b) => Number(a) - Number(b));
  const sorted = Object.fromEntries(urns.map((u) => [u, json[u]]));
  writeFileSync('data/schoolfacts.json', JSON.stringify(sorted));

  writeFileSync('scripts/d1-schoolfacts.sql',
    `CREATE TABLE IF NOT EXISTS schoolfacts (${COLS.map(([c, t]) => `${c} ${t}`).join(', ')});\n`);
  const colList = COLS.map(([c]) => c).join(',');
  const lines = [];
  for (let i = 0; i < urns.length; i += 25) {
    const vals = urns.slice(i, i + 25).map((u) => `(${flat(u, sorted[u]).map(lit).join(',')})`);
    lines.push(`INSERT OR REPLACE INTO schoolfacts (${colList}) VALUES\n${vals.join(',\n')};`);
  }
  writeFileSync('data/schoolfacts.sql', lines.join('\n') + '\n');

  const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
  const phases = {};
  for (const s of schools) {
    const ph = ['Primary', 'Secondary', 'All through', 'Middle deemed primary', 'Middle deemed secondary'].includes(s.phase) ? (s.phase === 'Primary' || s.phase === 'Middle deemed primary' ? 'primary' : 'secondary') : s.phase === 'All through' ? 'all-through' : 'other';
    const f = sorted[s.urn] || {};
    const p = (phases[ph] ??= { schools: 0, workforce: 0, ptr: 0, qts: 0, turnover: 0, vacancy: 0, finance: 0, send: 0, provision: 0, rpOrUnit: 0 });
    p.schools++;
    if (f.workforce) { p.workforce++; if (f.workforce.ptr !== null) p.ptr++; if (f.workforce.qts_pct != null) p.qts++; if (f.workforce.left_school_pct != null) p.turnover++; if (f.workforce.vacancy_rate != null) p.vacancy++; }
    if (f.finance) p.finance++;
    if (f.send) p.send++;
    if (f.provision) { p.provision++; if (f.provision.has_resourced_provision || f.provision.has_sen_unit) p.rpOrUnit++; }
  }
  diag.coverageByPhase = phases;
  diag.totalUrnsOutput = urns.length;
  diag.nonNumericTokens = bad;

  const dl = (p) => mt(p);
  const eesRel = 'Reporting year 2025 (School workforce in England)';
  writeFileSync('src/data/schoolfacts-sources.json', JSON.stringify({
    workforce: {
      publication: 'School workforce in England', release: eesRel, year: '2025/26 (November 2025 school workforce census)', turnoverYear: '2024/25 (teachers in post at the November 2024 census, followed to the November 2025 census)',
      datasets: {
        ptr: { dataset: 'Pupil to teacher ratios - school level', file: 'workforce_ptrs_2010_2025_sch.csv', url: FILES.ptr.url, downloaded: dl(FILES.ptr.path) },
        fte: { dataset: 'Size of the school workforce - school level', file: 'Workforce_2010_2025_fte_hc_sch.csv', url: FILES.fte.url, downloaded: dl(FILES.fte.path) },
        qts: { dataset: 'Teacher characteristics - school level', file: 'workforce_teacher_characteristics_sch_202526.csv', url: FILES.tch.url, downloaded: dl(FILES.tch.path) },
        turnover: { dataset: 'Teacher turnover - school level', file: 'teacher_turnover_2010_2025_sch.csv', url: FILES.turn.url, downloaded: dl(FILES.turn.path) },
        vacancies: { dataset: 'Teacher vacancies - school level', file: 'vacancies_number_rate_sch_2010_2025.csv', url: FILES.vac.url, downloaded: dl(FILES.vac.path) },
      },
      definitions: {
        ptr: 'pupil_to_qual_unqual_teacher_ratio: FTE pupils per FTE teacher (qualified and unqualified)',
        ptr_qualified: 'pupil_to_qual_teacher_ratio: FTE pupils per FTE qualified teacher',
        qts_pct: 'Qualified teachers (QTS) as % of the school\'s FTE teachers (teacher characteristics file, fte_school_percent; every other dimension Total)',
        vacancy_rate: 'Vacancies as % of (vacancies + FTE teachers in post), as published by DfE; verified against the FTE file',
        left_school_pct: '% of FTE teachers in post at the Nov 2024 census who were no longer in that school at the Nov 2025 census (left to another state school plus left the state sector)',
        left_system_pct: 'Part of left_school_pct: % who left the state-funded sector altogether',
      },
    },
    finance: {
      cfr: { publication: 'Schools financial benchmarking (FBIT) - Consistent Financial Reporting, LA maintained schools', file: 'CFR_2025-26_Full_Data_Workbook.xlsx (sheet CFR Data)', url: FILES.cfrX.url, year: 'Financial year 2025-26 (April 2025 to March 2026); final cut produced 26 August 2026', downloaded: dl(FILES.cfrX.path), pupils: 'FTE pupils, January 2026 school census (sole and dual main registration)' },
      aar: { publication: 'Schools financial benchmarking (FBIT) - Academies Accounts Return', file: 'AAR_2024-25_download.xlsx (sheet Academies)', url: FILES.aarX.url, year: 'Academy year September 2024 to August 2025 (version 2 updated 22 April 2026)', downloaded: dl(FILES.aarX.path), pupils: 'FTE pupils in academy plus dual subsidiary registrations (January 2025 census)' },
      definitions: {
        total_exp_per_pupil: 'Total expenditure / FTE pupils, in pounds. CFR: E01 to E29 plus E31 and E32 (excludes direct revenue financing of capital E30). AAR: DfE Total Expenditure column, which excludes capital expenditure. Revenue spending only, not capital.',
        teaching_staff_per_pupil: 'Teaching staff costs (CFR E01 / AAR Teaching staff) / FTE pupils, pounds. Excludes supply and agency teachers and teaching assistants.',
        academies: 'AAR figures are reported per academy (not apportioned from the trust) but exclude the trust\'s central services spending, which is a separate sheet and is not apportioned here, so academy figures are not like for like with maintained schools.',
        years: 'Maintained schools are 2025-26 financial year; academies are the earlier 2024/25 academy year. Each URN carries its own fin_year.',
      },
      rules: 'Returns covering fewer than 12 months, schools flagged Did Not Supply, and rows with non-numeric values are null. Academies with two part-year rows (mid-year trust move) are summed only if the months total 12. Federation members take the lead school\'s pooled per-pupil figure (fin_basis = federation).',
    },
    send: {
      publication: 'Special educational needs in England', release: 'Academic year 2025/26', year: '2025/26 (January 2026 school census)',
      dataset: 'School level data - 2026 (sen_school_level_ud_api.csv)', url: FILES.sen.url, downloaded: dl(FILES.sen.path),
      definitions: {
        sen_support_pct: 'Pupils on SEN support as % of all pupils on roll',
        ehc_pct: 'Pupils with an education, health and care plan as % of all pupils on roll',
        sen_total_pct: 'SEN support plus EHC plan as % of all pupils on roll',
        top_need: 'Most common primary type of need among pupils with SEN support or an EHC plan (excludes "SEN support but no specialist assessment"); needs_pct_of_sen gives each need as % of all pupils with SEN',
        sen_unit_pupils: 'Pupils recorded in a SEN unit in the census (count, not capacity)',
        resourced_provision_pupils: 'Pupils recorded in resourced provision in the census (count, not capacity)',
      },
    },
    provision: {
      publication: 'Get Information About Schools (GIAS) edubasealldata', url: giasUrl || FILES.gias.path, asOf: dl(FILES.gias.path),
      fields: 'ResourcedProvisionOnRoll/Capacity, SenUnitOnRoll/Capacity, TypeOfResourcedProvision, SEN1-SEN13 (types of need the school caters for)',
      definitions: { has_resourced_provision: '1 when GIAS records resourced provision (type, capacity or on roll)', has_sen_unit: '1 when GIAS records a SEN unit (type, capacity or on roll)', needs_catered: 'Need types the school says it caters for (SEN1-13, excluding Not applicable); for mainstream schools this is its stated provision, not pupil counts' },
    },
    generated: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');

  console.log(JSON.stringify(diag, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
