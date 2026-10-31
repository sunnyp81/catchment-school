import data from '../data/council-stats.json';
import { ordinal } from './oversub';

export const CS: any = data;
export const STATS_URL = '/school-statistics-by-council/';
export const STATS_CSV = '/downloads/school-statistics-by-council-2026.csv';
export const NODATA = 'No data';

export const fmt = (v: number | null | undefined, dp = 1) => (v == null ? NODATA : v.toFixed(dp));
export const fmtPct = (v: number | null | undefined) => (v == null ? NODATA : `${v.toFixed(1)}%`);

/** "12th lowest of 151" or "3rd highest of 151", whichever end is nearer. Rank ties share a place. */
export function rankText(x: { rank: number | null; rankHigh: number | null; of: number }, noun: string): string | null {
  if (x.rank == null || x.rankHigh == null) return null;
  const low = x.rank <= x.rankHigh;
  const r = low ? x.rank : x.rankHigh;
  return `${r === 1 ? '' : `${ordinal(r)} `}${low ? 'lowest' : 'highest'} ${noun} of ${x.of}`;
}

export const councilEntries = (): [string, any][] => Object.entries(CS.councils) as [string, any][];

/** Councils with a figure for key k, sorted ascending by value then name. */
export function sortedBy(k: string): { slug: string; name: string; v: number; n: number }[] {
  return councilEntries()
    .filter(([, c]) => c[k].v != null)
    .map(([slug, c]) => ({ slug, name: c.name, v: c[k].v as number, n: c[k].n as number }))
    .sort((a, b) => a.v - b.v || a.name.localeCompare(b.name));
}
