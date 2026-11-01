// Wording helpers for school pages: readable establishment noun when GIAS phase is "Not applicable",
// and how admissions work for each kind of establishment.
export type AdmissionsMode = 'council' | 'independent' | 'placed' | 'other';

const KNOWN_PHASE = /^(primary|secondary|nursery|special|all through|16 plus|middle deemed (primary|secondary))$/i;

export function hasKnownPhase(phase: unknown): boolean {
  return typeof phase === 'string' && KNOWN_PHASE.test(phase.trim());
}

export function articleFor(phrase: string): string {
  return /^[aeiou]/i.test(phrase.trim()) ? 'an' : 'a';
}

// Singular noun phrase from the establishment type, used only when the phase is unusable.
function nounFromType(type: unknown): string {
  const t = String(type ?? '').toLowerCase();
  if (/independent special/.test(t)) return 'independent special school';
  if (/independent/.test(t)) return 'independent school';
  if (/pupil referral/.test(t)) return 'pupil referral unit';
  if (/alternative provision/.test(t)) return 'alternative provision school';
  if (/special post 16/.test(t)) return 'special post-16 institution';
  if (/special/.test(t)) return 'special school';
  if (/welsh/.test(t)) return 'Welsh school';
  if (/higher education/.test(t)) return 'higher education institution';
  if (/secure unit/.test(t)) return 'secure unit';
  if (/offshore/.test(t)) return 'offshore school';
  if (/sixth form/.test(t)) return 'sixth form centre';
  if (/city technology/.test(t)) return 'city technology college';
  return 'school';
}

// { one: "independent school", many: "independent schools" } or phase based ("primary school").
export function schoolNoun(s: { phase?: unknown; type?: unknown }): { one: string; many: string; fromPhase: boolean } {
  if (hasKnownPhase(s.phase)) {
    const p = String(s.phase).trim().toLowerCase();
    return { one: `${p} school`, many: `${p} schools`, fromPhase: true };
  }
  const one = nounFromType(s.type);
  return { one, many: `${one}s`, fromPhase: false };
}

export function admissionsMode(s: { phase?: unknown; type?: unknown }): AdmissionsMode {
  const t = String(s.type ?? '').toLowerCase();
  if (/independent/.test(t)) return 'independent';
  if (/special|pupil referral|alternative provision/.test(t) || String(s.phase ?? '').toLowerCase() === 'special') return 'placed';
  if (/higher education|secure unit|offshore|miscellaneous|service children/.test(t)) return 'other';
  if (String(s.phase ?? '').trim().toLowerCase() === '16 plus') return 'other';
  return 'council';
}

export function titleCase(v: string): string {
  return v.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
