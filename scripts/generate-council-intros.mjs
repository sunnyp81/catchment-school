import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

// Load data
const las = JSON.parse(readFileSync(join(dataDir, 'las.json'), 'utf8'));
const schools = JSON.parse(readFileSync(join(dataDir, 'schools.json'), 'utf8'));
const existing = JSON.parse(readFileSync(join(dataDir, 'council-intros.json'), 'utf8'));

const existingSlugs = new Set(Object.keys(existing));
console.log(`Existing intros: ${existingSlugs.size}`);
console.log(`Total LAs: ${las.length}`);

// Build per-LA stats from schools data
function buildLaStats(laSlug) {
  const laSchools = schools.filter(s => s.laSlug === laSlug);

  const isPrimary = (s) => {
    if (s.phase && (s.phase.toLowerCase().includes('primary') || s.phase.toLowerCase().includes('middle') || s.phase === 'Infant' || s.phase === 'Junior')) return true;
    // Fallback: infer from school name for Welsh establishments and others with phase "Not applicable"
    // Also handle Welsh-language names: Gynradd/Feithrin = primary, Meithrin = nursery
    if (s.name && /primary|infant|junior|nursery|gynradd|feithrin|meithrin/i.test(s.name)) return true;
    return false;
  };
  const isSecondary = (s) => {
    if (s.phase && (s.phase.toLowerCase().includes('secondary') || s.phase.toLowerCase().includes('high'))) return true;
    // Fallback: infer from school name; also Welsh: Uwchradd = secondary
    if (s.name && /secondary|high school|college$|uwchradd/i.test(s.name)) return true;
    return false;
  };

  const primaryCount = laSchools.filter(isPrimary).length;
  const secondaryCount = laSchools.filter(isSecondary).length;

  // Count by town
  const townCounts = {};
  for (const s of laSchools) {
    if (!s.town || s.town.trim() === '') continue;
    const t = s.town.trim();
    townCounts[t] = (townCounts[t] || 0) + 1;
  }

  // Sort towns by count, filter out obvious junk/duplicates
  const sortedTowns = Object.entries(townCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter(t => t.length > 1 && !t.match(/^\d+$/) && t !== 'Not recorded');

  const topTowns = sortedTowns.slice(0, 5);

  // Selective check
  const selectiveCount = laSchools.filter(s => s.admissionsPolicy === 'Selective').length;

  // Faith check
  const faithCount = laSchools.filter(s =>
    s.religion && s.religion !== 'None' && s.religion !== 'Does not apply' && s.religion !== 'Not applicable'
  ).length;
  const faithPct = laSchools.length > 0 ? Math.round((faithCount / laSchools.length) * 100) : 0;

  return { primaryCount, secondaryCount, topTowns, selectiveCount, faithPct, total: laSchools.length };
}

// Para 1: size + spread
function para1(laName, stats, laTotal) {
  const { primaryCount, secondaryCount, total } = stats;
  const p = primaryCount;
  const s = secondaryCount;

  if (laTotal >= 500) {
    return `${laName} runs one of the larger school estates in England — ${p} primary and ${s} secondary schools, spread across towns, villages and denser urban centres.`;
  } else if (laTotal >= 200) {
    const templates = [
      `${laName} has ${laTotal} schools — ${p} primary and ${s} secondary — spread across towns and areas throughout the authority.`,
      `Schools in ${laName} split across ${p} primaries and ${s} secondaries, with catchment boundaries set afresh each admissions cycle by the council's school admissions team.`,
      `${laName} publishes its school admissions policy annually. With ${p} primary and ${s} secondary schools to allocate, the council uses a ranked oversubscription tiebreaker — usually looked-after children, then siblings, then catchment distance.`,
      `Finding the right catchment in ${laName} means weighing ${p} primary schools and ${s} secondaries against where you can realistically live — distance criteria tend to bite hardest in the council's more popular towns.`,
    ];
    return templates[Math.floor(laTotal % templates.length)];
  } else if (laTotal < 30) {
    return `${laName} is a compact authority with ${laTotal} schools — ${p} primary and ${s} secondary — meaning most families have a limited number of realistic options within a reasonable distance.`;
  } else {
    const templates = [
      `${laName} has ${laTotal} schools — ${p} primary and ${s} secondary — spread across ${laTotal > 80 ? 'a mix of' : 'its'} towns and areas.`,
      `Schools in ${laName} split across ${p} primaries and ${s} secondaries, with catchment boundaries set afresh each admissions cycle by the council's school admissions team.`,
      `${laName} coordinates admissions across ${p} primary and ${s} secondary schools, with oversubscription criteria applied consistently across the authority.`,
    ];
    return templates[Math.floor(laTotal % templates.length)];
  }
}

// Para 2: concentrations
function para2(laName, topTowns, laTotal) {
  if (topTowns.length === 0) {
    return `School places in ${laName} are spread across the authority — check the map below to see which schools fall within a reasonable distance of your address.`;
  }

  if (topTowns.length === 1) {
    return `The vast majority of schools in ${laName} are concentrated in ${topTowns[0]} — distance and catchment criteria apply as usual, but choice is limited outside the main settlement.`;
  }

  if (topTowns.length === 2) {
    return `The busiest areas for schools are ${topTowns[0]} and ${topTowns[1]}, which together account for the majority of pupil places in the authority.`;
  }

  const t1 = topTowns[0];
  const t2 = topTowns[1];
  const t3 = topTowns[2];

  const templates = [
    `The largest concentrations sit around ${t1}, ${t2} and ${t3}, which together account for a meaningful share of the council's pupil places.`,
    `Expect the tightest competition in and around ${t1} and ${t2}, where popular primaries are regularly oversubscribed and last-distance-offered figures can shrink to a few hundred metres.`,
    `${t1}, ${t2} and ${t3} host the biggest clusters — useful to know when a preferred school is oversubscribed, because the next-nearest alternative is often in a neighbouring town rather than the same catchment.`,
    `School density is highest in ${t1} and ${t2} — parents in other parts of ${laName} should check the exact distance-offered figure from the previous year before banking on proximity alone.`,
  ];

  // Pick variant based on total to spread variety
  const idx = Math.floor(laTotal % templates.length);
  return templates[idx];
}

// Para 3: distinctive features
function para3(laName, stats) {
  const { selectiveCount, faithPct } = stats;

  if (selectiveCount > 0) {
    return `Selective schools are part of the mix in ${laName} — for those applying to grammar schools, a selective admissions test is required in addition to the standard admissions process.`;
  }

  if (faithPct > 15) {
    return `Around ${faithPct}% of schools in ${laName} have a religious character — Church of England, Catholic, or other faith — which means faith criteria sit alongside catchment distance in those schools' oversubscription tiebreakers.`;
  }

  return `Admissions to all schools in ${laName} are coordinated by the council — catchment area and sibling priority are the most common tiebreakers when schools are oversubscribed.`;
}

// Special-case slugs to skip (offshore/special)
const SKIP_SLUGS = new Set([
  'fieldwork-overseas-establishments',
  'isle-of-man-offshore-establishments',
  'scotland-offshore-establishments',
  'isles-of-scilly',
]);

const result = { ...existing };
let added = 0;
const unusual = [];

for (const la of las) {
  const { slug, name, count } = la;

  // Skip if already has intro
  if (existingSlugs.has(slug)) continue;

  // Skip offshore/special LAs
  if (SKIP_SLUGS.has(slug)) {
    console.log(`SKIP (special): ${slug}`);
    continue;
  }

  const stats = buildLaStats(slug);

  // Flag unusual data
  if (stats.total === 0) {
    unusual.push(`${slug}: 0 schools found in schools.json (las.json count=${count})`);
  }
  if (stats.primaryCount === 0 && stats.secondaryCount === 0 && stats.total > 5) {
    unusual.push(`${slug}: ${stats.total} schools but 0 primaries and 0 secondaries (phase data may be missing)`);
  }
  if (stats.topTowns.length === 0) {
    unusual.push(`${slug}: no town data found`);
  }

  const p1 = para1(name, stats, count);
  const p2 = para2(name, stats.topTowns, count);
  const p3 = para3(name, stats);

  result[slug] = {
    paragraphs: [p1, p2, p3],
  };

  added++;
}

// Write merged output
writeFileSync(
  join(dataDir, 'council-intros.json'),
  JSON.stringify(result, null, 2),
  'utf8'
);

const totalEntries = Object.keys(result).length;
console.log(`\nDone.`);
console.log(`Added: ${added} new intros`);
console.log(`Total entries in file: ${totalEntries}`);
console.log(`Expected LAs: ${las.length}`);

if (unusual.length > 0) {
  console.log(`\nUnusual data flagged (${unusual.length}):`);
  unusual.forEach(u => console.log('  -', u));
} else {
  console.log('\nNo unusual data flagged.');
}
