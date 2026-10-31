import towns from '../data/towns.json';

// Area pages exist only for towns in towns.json (2+ schools); single-school towns and blank towns have none.
const AREA_SLUGS = new Set((towns as { slug: string }[]).map((t) => t.slug));
export const hasArea = (slug?: string | null): boolean => !!slug && AREA_SLUGS.has(slug);
