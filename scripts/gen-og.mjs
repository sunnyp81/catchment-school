// Generate the default Open Graph image (1200x630) using Satori + resvg.
// Run: node scripts/gen-og.mjs
// Output: public/og-default.png

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outDir = join(projectRoot, 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Fetch fonts at build time via Google Fonts CSS (works around versioned 404s).
async function fetchFontFromCss(cssUrl) {
  const r = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' } });
  if (!r.ok) throw new Error(`CSS fetch failed: ${cssUrl} ${r.status}`);
  const css = await r.text();
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:woff2?|ttf))\)/);
  if (!match) throw new Error(`No font URL in CSS: ${cssUrl}\n${css.slice(0,300)}`);
  const fr = await fetch(match[1]);
  if (!fr.ok) throw new Error(`Font fetch failed: ${match[1]} ${fr.status}`);
  return Buffer.from(await fr.arrayBuffer());
}

const UA_TTF = { 'User-Agent': 'Wget/1.21' };
async function fetchTtf(family, weight, italic = false) {
  const url = `https://fonts.googleapis.com/css2?family=${family}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
  const r = await fetch(url, { headers: UA_TTF });
  const css = await r.text();
  const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:woff2?|ttf))\)/);
  if (!m) throw new Error(`No font URL for ${family} ${weight}\n${css.slice(0,300)}`);
  const fr = await fetch(m[1]);
  return Buffer.from(await fr.arrayBuffer());
}

const [newsreader600, interTight600, interTight400] = await Promise.all([
  fetchTtf('Newsreader', 600),
  fetchTtf('Inter+Tight', 600),
  fetchTtf('Inter+Tight', 400),
]);

const PAPER = '#F2EDE0';
const INK = '#16202B';
const INK2 = '#3A4750';
const GREEN = '#2B5440';
const TERRACOTTA = '#C8593A';
const RULE = '#16202833';

const node = {
  type: 'div',
  props: {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      background: PAPER,
      padding: '64px 72px',
      fontFamily: 'Inter Tight',
      color: INK,
      position: 'relative',
    },
    children: [
      // Top bar
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '20px',
            color: INK2,
            marginBottom: '40px',
          },
          children: [
            {
              type: 'svg',
              props: {
                width: 38,
                height: 38,
                viewBox: '0 0 34 34',
                children: [
                  { type: 'path', props: { d: 'M17 4 L29 11 L29 23 L17 30 L5 23 L5 11 Z', fill: 'none', stroke: INK, strokeWidth: 1.4 } },
                  { type: 'path', props: { d: 'M17 4 L29 11 L17 18 L5 11 Z', fill: GREEN } },
                  { type: 'circle', props: { cx: 17, cy: 20, r: 2.6, fill: TERRACOTTA } },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: { fontFamily: 'Newsreader', fontSize: '28px', fontWeight: 600, letterSpacing: '-0.02em', display: 'flex' },
                children: [
                  'catchment',
                  { type: 'span', props: { style: { color: TERRACOTTA, fontStyle: 'italic', fontWeight: 500 }, children: '.school' } },
                ],
              },
            },
            { type: 'div', props: { style: { flex: 1 } } },
            { type: 'div', props: { style: { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: '18px', color: INK2 }, children: 'England & Wales · 2026/27' } },
          ],
        },
      },

      // Eyebrow
      {
        type: 'div',
        props: {
          style: { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: '24px', color: TERRACOTTA, marginBottom: '18px' },
          children: 'A free, independent guide for parents',
        },
      },

      // Headline
      {
        type: 'div',
        props: {
          style: {
            fontFamily: 'Newsreader',
            fontSize: '78px',
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: '-0.022em',
            color: INK,
            marginBottom: '32px',
            display: 'flex',
            flexWrap: 'wrap',
          },
          children: [
            'Which schools is your address ',
            { type: 'span', props: { style: { fontStyle: 'italic', fontWeight: 500, color: GREEN }, children: 'actually' } },
            ' in catchment for?',
          ],
        },
      },

      // Spacer pushes footer down
      { type: 'div', props: { style: { flex: 1 } } },

      // Bottom stat row
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            gap: '0',
            borderTop: `1px solid ${RULE}`,
            paddingTop: '28px',
            marginTop: '18px',
          },
          children: [
            ['27,000+', 'Schools'],
            ['178', 'Local authorities'],
            ['Monthly', 'DfE-sourced refresh'],
            ['Free', 'No sign-up'],
          ].map(([value, label], i, arr) => ({
            type: 'div',
            props: {
              style: {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                paddingRight: '20px',
                borderRight: i < arr.length - 1 ? `1px solid ${RULE}` : 'none',
                paddingLeft: i === 0 ? '0' : '20px',
              },
              children: [
                { type: 'div', props: { style: { fontFamily: 'Newsreader', fontSize: '42px', fontWeight: 500, letterSpacing: '-0.025em', color: INK }, children: value } },
                { type: 'div', props: { style: { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: '18px', color: INK2, marginTop: '4px' }, children: label } },
              ],
            },
          })),
        },
      },
    ],
  },
};

const svg = await satori(node, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Newsreader', data: newsreader600, weight: 600, style: 'normal' },
    { name: 'Inter Tight', data: interTight400, weight: 400, style: 'normal' },
    { name: 'Inter Tight', data: interTight600, weight: 600, style: 'normal' },
  ],
});

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
const outPath = join(outDir, 'og-default.png');
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
