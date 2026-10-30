/**
 * Builds data/ofsted.sql (INSERT OR REPLACE for the D1 `ofsted` table) from src/data/ofsted-map.json.
 * No D1 writes. Run: node scripts/gen-ofsted-sql.mjs, then load scripts/d1-ofsted.sql then data/ofsted.sql.
 * Columns: rating/rdate = graded overall effectiveness (1-4) + inspection start date dd/mm/yyyy; ud/uo = latest ungraded inspection;
 * rcd/rc = report-card date + area grades (JSON); gx = graded under a predecessor URN; ot = Ofsted report provider type (NULL = 21).
 */
import { readFileSync, writeFileSync } from 'fs';

const map = JSON.parse(readFileSync('src/data/ofsted-map.json', 'utf8'));
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const COLS = 'urn,rating,rdate,ud,uo,rcd,rc,gx,ot';
const CHUNK = 100; // keeps each statement well under the D1 100KB statement limit
const rows = Object.entries(map).map(([urn, e]) =>
  `(${[q(urn), q(e.ofstedRating), q(e.ofstedDate), q(e.ud), q(e.uo), q(e.rcd), e.rc ? q(JSON.stringify(e.rc)) : 'NULL', e.gx ? 1 : 'NULL', e.ot ?? 'NULL'].join(',')})`);
let out = '';
for (let i = 0; i < rows.length; i += CHUNK) out += `INSERT OR REPLACE INTO ofsted (${COLS}) VALUES\n${rows.slice(i, i + CHUNK).join(',\n')};\n`;
writeFileSync('data/ofsted.sql', out);
console.log(`ofsted rows: ${rows.length} -> data/ofsted.sql (${(out.length / 1e6).toFixed(2)} MB)`);
