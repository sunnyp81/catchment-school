#!/usr/bin/env node
/**
 * Generate per-council unique intro paragraphs for the top 20 LAs by school count.
 * Pulls real data from schools.json: school count, primary/secondary split, largest
 * towns, faith/academy/selective share. Output: src/data/council-intros.json.
 *
 * Trust-signal bundle — catchment.school Apr 19 recovery pass.
 * Run: node scripts/gen-council-intros.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const las = JSON.parse(readFileSync(join(ROOT, 'src/data/las.json'), 'utf8'));
const schools = JSON.parse(readFileSync(join(ROOT, 'src/data/schools.json'), 'utf8'));

// Top 20 LAs by school count
const topLAs = [...las].sort((a, b) => b.count - a.count).slice(0, 20);

// Simple hash for deterministic variant selection per LA
function h(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(n);
}

// Variant openers — picked deterministically by LA slug hash so each LA gets a different shape
const openerVariants = [
  (la, primaries, secondaries) =>
    `${la.name} runs one of the larger school estates in England — ${primaries.toLocaleString()} primary and ${secondaries.toLocaleString()} secondary schools, spread across market towns, villages and denser urban centres.`,
  (la, primaries, secondaries) =>
    `Schools in ${la.name} split across ${primaries.toLocaleString()} primaries and ${secondaries.toLocaleString()} secondaries, with catchment boundaries set afresh each admissions cycle by the council's school admissions team.`,
  (la, primaries, secondaries) =>
    `Finding the right catchment in ${la.name} means weighing ${primaries.toLocaleString()} primary schools and ${secondaries.toLocaleString()} secondaries against where you can realistically live — distance criteria tend to bite hardest in the council's more popular towns.`,
  (la, primaries, secondaries) =>
    `${la.name} publishes its school admissions policy annually. With ${primaries.toLocaleString()} primary and ${secondaries.toLocaleString()} secondary schools to allocate, the council uses a ranked oversubscription tiebreaker — usually looked-after children, then siblings, then catchment distance.`,
];

const secondaryVariants = [
  (la, topTowns) =>
    `The largest concentrations sit around ${topTowns.slice(0, 3).map(t => t.name).join(', ')}, which together account for a meaningful share of the council's pupil places.`,
  (la, topTowns) =>
    `School density is highest in ${topTowns.slice(0, 2).map(t => t.name).join(' and ')} — parents in rural parts of ${la.name} should check the exact distance-offered figure from the previous year before banking on proximity alone.`,
  (la, topTowns) =>
    `Expect the tightest competition in and around ${topTowns[0]?.name}${topTowns[1] ? ` and ${topTowns[1].name}` : ''}, where popular primaries are regularly oversubscribed and last-distance-offered figures can shrink to a few hundred metres.`,
  (la, topTowns) =>
    `${topTowns[0]?.name}${topTowns[1] ? `, ${topTowns[1].name} and ${topTowns[2]?.name ?? topTowns[1].name}` : ''} host the biggest clusters — useful to know when a preferred school is oversubscribed, because the next-nearest alternative is often in a neighbouring town rather than the same catchment.`,
];

const thirdVariants = [
  (la, faith, academy, selective) =>
    faith > 20
      ? `Around ${faith}% of schools in ${la.name} have a religious character — Church of England, Catholic, or other faith — which means faith criteria sit alongside catchment distance in those schools' oversubscription tiebreakers.`
      : academy > 30
      ? `Academies and multi-academy trusts account for roughly ${academy}% of the estate here, and each trust can set its own admissions policy within the statutory School Admissions Code — worth reading the trust's policy, not just the council's.`
      : selective > 0
      ? `${la.name} retains selective (grammar) schools, so for those schools admission goes by test result first and distance or catchment only as a tiebreaker among qualifying applicants.`
      : `Most schools here are community or academy schools admitting on distance-based oversubscription criteria rather than faith or selection.`,
  (la, faith, academy, selective) =>
    selective > 0
      ? `Selective schools are part of the mix in ${la.name} — for those, passing the admissions test comes first and catchment distance only applies as a tiebreaker.`
      : faith > 15
      ? `A meaningful share of ${la.name}'s schools — about ${faith}% — are faith schools, so if you're applying to one, the faith criterion is typically weighted above simple distance.`
      : `Most ${la.name} schools admit on distance-based oversubscription criteria. Always read the specific school's admissions policy, as academies set their own rules within the national Admissions Code.`,
];

const closers = [
  la => `The catchment boundary for any given school is defined in the council's annual admissions booklet — we link to that search for every ${la.name} school below.`,
  la => `For the exact catchment map and the previous year's last-distance-offered figure, always check ${la.name}'s current admissions policy before assuming your postcode is inside a school's boundary.`,
  la => `Each ${la.name} school below links to its official DfE record and Ofsted report so you can verify everything against the source data yourself.`,
];

const intros = {};

for (const la of topLAs) {
  const laSchools = schools.filter(s => s.laSlug === la.slug);
  const primaries = laSchools.filter(s => s.phase === 'Primary').length;
  const secondaries = laSchools.filter(s => s.phase === 'Secondary').length;

  // Top towns by school count within the LA
  const townCounts = {};
  for (const s of laSchools) {
    if (!s.town) continue;
    townCounts[s.town] = (townCounts[s.town] || 0) + 1;
  }
  const topTowns = Object.entries(townCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Faith / academy / selective share
  const faithCount = laSchools.filter(s =>
    s.religion && s.religion !== 'Does not apply' && s.religion !== 'None'
  ).length;
  const academyCount = laSchools.filter(s =>
    (s.type || '').toLowerCase().includes('academy')
  ).length;
  const selectiveCount = laSchools.filter(s => s.admissionsPolicy === 'Selective').length;

  const faithPct = Math.round((faithCount / laSchools.length) * 100);
  const academyPct = Math.round((academyCount / laSchools.length) * 100);

  const hash = h(la.slug);
  const opener = openerVariants[hash % openerVariants.length](la, primaries, secondaries);
  const second = secondaryVariants[(hash >> 3) % secondaryVariants.length](la, topTowns);
  const third = thirdVariants[(hash >> 5) % thirdVariants.length](la, faithPct, academyPct, selectiveCount);
  const closer = closers[(hash >> 7) % closers.length](la);

  intros[la.slug] = {
    paragraphs: [opener, second, third, closer],
    meta: {
      schoolCount: laSchools.length,
      primaries,
      secondaries,
      topTowns: topTowns.map(t => t.name),
      faithPct,
      academyPct,
      selectiveCount,
    },
  };
}

const outPath = join(ROOT, 'src/data/council-intros.json');
writeFileSync(outPath, JSON.stringify(intros, null, 2));
console.log(`Wrote ${Object.keys(intros).length} council intros to ${outPath}`);
