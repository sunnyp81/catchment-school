import pairsData from '../data/compare-pairs.json';

export const PERF_FIELDS = ['a8', 'p8', 'p8_lower', 'p8_upper', 'em5', 'em4', 'ks4_cohort', 'alevel_aps', 'alevel_grade', 'alevel_entries', 'abs_overall', 'abs_persistent'] as const;

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Phase groups: Secondary and All through compare with each other; Primary is its own group.
export function phaseGroup(phase: string | null | undefined): 'secondary' | 'primary' | null {
  if (phase === 'Secondary' || phase === 'All through') return 'secondary';
  if (phase === 'Primary') return 'primary';
  return null;
}

export const deDash = (v: any) => (typeof v === 'string' ? v.replace(/[–—�]/g, '-') : v);

export const pairKey = (a: string | number, b: string | number) => {
  const [x, y] = Number(a) <= Number(b) ? [a, b] : [b, a];
  return `${x}-${y}`;
};

// compare-pairs.json: { latestYear, pairs: "urnA-urnB urnA-urnC ..." } with lower URN first.
let curatedSet: Set<string> | null = null;
let curatedByUrn: Map<string, string[]> | null = null;
function build() {
  curatedSet = new Set();
  curatedByUrn = new Map();
  const raw = ((pairsData as any).pairs as string) || '';
  for (const k of raw.split(' ')) {
    if (!k) continue;
    curatedSet.add(k);
    const [a, b] = k.split('-');
    (curatedByUrn.get(a) ?? curatedByUrn.set(a, []).get(a)!).push(b);
    (curatedByUrn.get(b) ?? curatedByUrn.set(b, []).get(b)!).push(a);
  }
}
export function isCurated(urnA: string | number, urnB: string | number) {
  if (!curatedSet) build();
  return curatedSet!.has(pairKey(urnA, urnB));
}
export function curatedPartners(urn: string | number): string[] {
  if (!curatedByUrn) build();
  return curatedByUrn!.get(String(urn)) ?? [];
}
export const curatedLatestYear: string | null = (pairsData as any).latestYear ?? null;

// Slugs end in -{urn} and may contain "-vs-": try every "-vs-" split where both halves end in a URN.
export async function resolvePair(db: any, pair: string) {
  const urnTail = /-(\d{5,7})$/;
  let from = 0;
  while (true) {
    const i = pair.indexOf('-vs-', from);
    if (i < 0) return null;
    from = i + 1;
    const left = pair.slice(0, i);
    const right = pair.slice(i + 4);
    if (!urnTail.test(left) || !urnTail.test(right)) continue;
    const rows = (await db.prepare('SELECT * FROM schools WHERE slug IN (?, ?)').bind(left, right).all()).results as any[];
    const a = rows.find((r) => r.slug === left);
    const b = rows.find((r) => r.slug === right);
    if (a && b) return { a, b };
  }
}
