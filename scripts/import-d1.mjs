/**
 * Imports schools.json into D1 in batches via wrangler CLI.
 * Uses individual INSERT statements (avoids SQLITE_TOOBIG on VALUES clauses).
 * Run: node scripts/import-d1.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const schools = JSON.parse(readFileSync('src/data/schools.json', 'utf8'));
const DB = 'catchment-school-db';
const ROWS_PER_FILE = 200; // 200 individual INSERT statements per batch file

function escape(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const cols = ['slug','urn','name','town','townSlug','la','laSlug','phase','type','ageRange','pupils','capacity','postcode','street','locality','lat','lng','website','gender','religion','admissionsPolicy','fsm'];

let total = 0;
for (let i = 0; i < schools.length; i += ROWS_PER_FILE) {
  const batch = schools.slice(i, i + ROWS_PER_FILE);
  const stmts = batch.map(s =>
    `INSERT OR REPLACE INTO schools (${cols.join(',')}) VALUES (${cols.map(c => escape(s[c])).join(',')});`
  );
  const sql = stmts.join('\n');
  const tmpFile = `scripts/_batch_${i}.sql`;
  writeFileSync(tmpFile, sql);
  console.log(`Importing rows ${i + 1}–${Math.min(i + ROWS_PER_FILE, schools.length)} of ${schools.length}...`);
  try {
    execSync(`npx wrangler d1 execute ${DB} --file=${tmpFile} --remote`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Failed on batch starting at row ${i + 1}. File kept at ${tmpFile} for retry.`);
    process.exit(1);
  }
  unlinkSync(tmpFile);
  total += batch.length;
}
console.log(`\nDone — imported ${total} schools into D1`);
