/**
 * Post-build fix: Cloudflare Pages reserves the name "ASSETS" for its own binding.
 * The @astrojs/cloudflare adapter generates wrangler.json with binding name "ASSETS",
 * which causes the Pages CI build to fail validation.
 * This script renames it to "STATIC_ASSETS" in generated configs.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const files = [
  join(root, 'dist/server/wrangler.json'),
  join(root, 'dist/server/.prerender/wrangler.json'),
];

for (const file of files) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  const fixed = content.replace(/"binding"\s*:\s*"ASSETS"/g, '"binding":"STATIC_ASSETS"');
  writeFileSync(file, fixed);
  console.log(`Patched: ${file}`);
}
console.log('Done.');
