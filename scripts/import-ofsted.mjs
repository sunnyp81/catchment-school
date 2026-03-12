/**
 * Merges Ofsted ratings into D1 from the latest inspections CSV.
 * Adds `ofstedRating` column (Outstanding/Good/Requires improvement/Inadequate)
 * and `ofstedDate` (inspection publication date).
 *
 * Run: node scripts/import-ofsted.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { parse } from 'csv-parse/sync';

const DB = 'catchment-school-db';

// Parse the Ofsted CSV
const csv = readFileSync('data/ofsted-latest.csv', 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });

console.log(`Loaded ${rows.length} Ofsted inspection records`);

// Build URN → { rating, date } map
const ratingMap = new Map();
for (const row of rows) {
  const urn = row['URN']?.trim();
  const rating = row['Overall effectiveness']?.trim();
  const date = row['Latest graded inspection publication date']?.trim()
    || row['Publication date']?.trim()
    || '';
  if (urn && rating && rating !== '') {
    ratingMap.set(urn, { rating, date });
  }
}

console.log(`Mapped ${ratingMap.size} schools with Ofsted ratings`);

// Add columns if they don't exist
const alterSql = `
ALTER TABLE schools ADD COLUMN ofstedRating TEXT;
ALTER TABLE schools ADD COLUMN ofstedDate TEXT;
`;
const alterFile = 'scripts/_alter_ofsted.sql';
writeFileSync(alterFile, alterSql);
console.log('Adding ofstedRating and ofstedDate columns...');
try {
  execSync(`npx wrangler d1 execute ${DB} --file=${alterFile} --remote`, { stdio: 'inherit' });
} catch {
  // Columns may already exist — ignore
  console.log('(Columns may already exist — continuing)');
}
unlinkSync(alterFile);

// Update in batches of 200
const entries = [...ratingMap.entries()];
const BATCH = 200;
let updated = 0;

for (let i = 0; i < entries.length; i += BATCH) {
  const batch = entries.slice(i, i + BATCH);
  const stmts = batch.map(([urn, { rating, date }]) => {
    const r = rating.replace(/'/g, "''");
    const d = date.replace(/'/g, "''");
    return `UPDATE schools SET ofstedRating='${r}', ofstedDate='${d}' WHERE urn='${urn}';`;
  });
  const sql = stmts.join('\n');
  const tmpFile = `scripts/_ofsted_batch_${i}.sql`;
  writeFileSync(tmpFile, sql);
  console.log(`Updating rows ${i + 1}–${Math.min(i + BATCH, entries.length)}...`);
  execSync(`npx wrangler d1 execute ${DB} --file=${tmpFile} --remote`, { stdio: 'inherit' });
  unlinkSync(tmpFile);
  updated += batch.length;
}

console.log(`\nDone — updated ${updated} schools with Ofsted ratings`);
