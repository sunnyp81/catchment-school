import towns from '../data/towns.json';

// Area pages exist only for towns in towns.json (2+ schools); single-school towns and blank towns have none.
const AREA_SLUGS = new Set((towns as { slug: string }[]).map((t) => t.slug));
export const hasArea = (slug?: string | null): boolean => !!slug && AREA_SLUGS.has(slug);

type Sch = { townSlug?: string; town?: string; county?: string; laSlug?: string; type?: string };
const townMeta = new Map((towns as { slug: string; name: string; count: number }[]).map((t) => [t.slug, t]));

function dominant(values: (string | undefined)[]): string {
  const m: Record<string, number> = {};
  for (const v of values) if (v) m[v] = (m[v] || 0) + 1;
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}

const titleCaseIfShouting = (n: string) =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, p, c) => p + c.toUpperCase()) : n;

export type TownGroup = { name: string; slug: string | null; schools: any[] };

// Groups one council's schools into areas. Groups by canonical town slug (so CHELTENHAM and Cheltenham merge) and
// moves a postal town into "Other schools" when most of that town's schools sit in a different council and the
// postal county disagrees with the council's own (Ledbury, Monmouth, Bicester and similar).
export function groupCouncilTowns(laSchools: any[]): TownGroup[] {
  const home = dominant(laSchools.map((s: Sch) => s.county));
  const raw: Record<string, any[]> = {};
  for (const s of laSchools as Sch[]) {
    const key = s.townSlug || (s.town ? s.town.trim().toLowerCase() : '');
    (raw[key] ||= []).push(s);
  }
  const groups: TownGroup[] = [];
  const other: any[] = [];
  for (const [key, list] of Object.entries(raw)) {
    const meta = townMeta.get(key);
    const county = dominant(list.map((s) => s.county));
    const foreign = !!meta && list.length / meta.count < 0.5 && !!county && !!home && county !== home;
    if (!key || foreign) { other.push(...list); continue; }
    const name = meta?.name ?? titleCaseIfShouting(dominant(list.map((s) => s.town)) || key);
    groups.push({ name, slug: meta ? key : null, schools: list });
  }
  groups.sort((a, b) => b.schools.length - a.schools.length);
  if (other.length) groups.push({ name: 'Other schools', slug: null, schools: other });
  return groups;
}

// Sibling areas for an area page: areas that belong to the same council, with the same out-of-council filter.
export function siblingAreas(allSchools: any[], laSlug: string, currentSlug: string, limit = 12) {
  const laSchools = allSchools.filter((s: Sch) => s.laSlug === laSlug);
  return groupCouncilTowns(laSchools)
    // A sibling must be mostly this council's own: Milton Keynes and Slough have a few Buckinghamshire-council schools but belong to other councils.
    .filter((g) => g.slug && g.slug !== currentSlug && g.schools.length / townMeta.get(g.slug)!.count >= 0.5)
    .map((g) => ({ slug: g.slug as string, name: townMeta.get(g.slug as string)!.name, count: townMeta.get(g.slug as string)!.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// State-funded school types, the same set scripts/gen-council-stats.mjs uses for the council statistics snapshot.
export const STATE_TYPES = new Set(['Academy converter', 'Community school', 'Academy sponsor led', 'Voluntary aided school', 'Voluntary controlled school', 'Foundation school', 'Free schools',
  'Community special school', 'Local authority nursery school', 'Academy special converter', 'Free schools special', 'Academy special sponsor led', 'Foundation special school',
  'Pupil referral unit', 'Academy alternative provision converter', 'Academy alternative provision sponsor led', 'Free schools alternative provision', 'University technical college', 'Studio schools', 'City technology college']);
