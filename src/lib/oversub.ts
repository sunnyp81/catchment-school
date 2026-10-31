import data from '../data/oversubscription.json';

export const SITE = 'https://catchment.school';
export const NP = 'Not published';
export const OS: any = data;
export const HUB = '/oversubscribed-schools/';
export const CSV_URL = '/downloads/oversubscribed-schools-2026.csv';
export const SOURCE_LINE = 'Source: Department for Education, Primary and secondary school applications and offers, academic year 2026/27, published 18 June 2026. Offer day figures: Year 7 on 2 March 2026 and Reception on 16 April 2026.';
export const OGL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const int = (n: number | null | undefined) => (n == null ? NP : n.toLocaleString('en-GB'));
export const f2 = (n: number | null | undefined) => (n == null ? NP : n.toFixed(2));
export const pct = (n: number | null | undefined) => (n == null ? NP : `${n.toFixed(1)}%`);
export const seriesCell = (v: number | 'low' | null) => (v === null ? NP : v === 'low' ? 'Under 30 offers' : v.toFixed(2));

export type Row = {
  slug: string | null; name: string; council?: string; councilSlug?: string | null;
  fp: number; offers: number; fppo: number; pctOffered: number | null;
  selective: boolean; faith: boolean; series?: (number | 'low' | null)[];
};

/** Council tables store rows as compact arrays: [slug, name, fp, offers, fppo, pctOffered, selective, faith]. */
export const rowsFromCompact = (rows: any[]): Row[] =>
  rows.map((r) => ({ slug: r[0], name: r[1], fp: r[2], offers: r[3], fppo: r[4], pctOffered: r[5], selective: !!r[6], faith: !!r[7] }));
