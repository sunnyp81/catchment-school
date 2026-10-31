// Compact build-time Ofsted view for prerendered council and area pages, from data/ofsted.sql (same source as the D1 table).
// Writes src/data/ofsted-grades.json: { urn: [latestGradedRating 1-4 or 0, hasReportCard 0/1] }.
// Run: node scripts/gen-ofsted-grades.mjs
import { readFileSync, writeFileSync } from 'fs';

const out = {};
let min = null;
for (const l of readFileSync('data/ofsted.sql', 'utf8').split('\n')) {
  const r = l.match(/^\('(\d+)',(?:NULL|'(\d)'),(?:NULL|'[^']*'),(?:NULL|'[^']*'),(?:NULL|'[^']*'),(?:NULL|'([^']*)')/);
  if (!r) continue;
  out[r[1]] = [r[2] ? Number(r[2]) : 0, r[3] ? 1 : 0];
  if (r[3]) { const d = r[3].split('/').reverse().join('-'); if (!min || d < min) min = d; }
}
writeFileSync('src/data/ofsted-grades.json', JSON.stringify(out));
const v = Object.values(out);
console.log('urns', v.length, 'graded', v.filter((x) => x[0]).length, 'cards', v.filter((x) => x[1]).length, 'earliest card', min);
