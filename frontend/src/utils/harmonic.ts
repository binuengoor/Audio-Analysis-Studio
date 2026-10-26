/** Harmonic-mixing helpers built on the Camelot wheel. */

export interface CamelotKey {
  number: number; // 1-12
  letter: 'A' | 'B'; // A = minor, B = major
}

export type HarmonicRelation = 'same' | 'adjacent' | 'relative';

export const parseCamelot = (value: string | null | undefined): CamelotKey | null => {
  const match = /^(1[0-2]|[1-9])([AB])$/i.exec((value ?? '').trim());
  if (!match) return null;
  return { number: Number(match[1]), letter: match[2].toUpperCase() as 'A' | 'B' };
};

const wrap = (n: number) => ((n - 1 + 12) % 12) + 1;

/** Keys that mix cleanly with `camelot`: itself, ±1 on the wheel, and the relative major/minor. */
export const compatibleKeys = (camelot: string | null | undefined): string[] => {
  const key = parseCamelot(camelot);
  if (!key) return [];
  const other = key.letter === 'A' ? 'B' : 'A';
  return [
    `${key.number}${key.letter}`,
    `${wrap(key.number + 1)}${key.letter}`,
    `${wrap(key.number - 1)}${key.letter}`,
    `${key.number}${other}`,
  ];
};

export const harmonicRelation = (
  a: string | null | undefined,
  b: string | null | undefined
): HarmonicRelation | null => {
  const ka = parseCamelot(a);
  const kb = parseCamelot(b);
  if (!ka || !kb) return null;
  if (ka.number === kb.number && ka.letter === kb.letter) return 'same';
  if (ka.number === kb.number) return 'relative';
  if (ka.letter === kb.letter && (wrap(ka.number + 1) === kb.number || wrap(ka.number - 1) === kb.number)) {
    return 'adjacent';
  }
  return null;
};

/** True when `bpm` is within `tolerancePct` of `reference` (a pitch-fader range DJs can bridge). */
export const bpmWithin = (
  bpm: number | null | undefined,
  reference: number | null | undefined,
  tolerancePct = 6
): boolean => {
  if (!bpm || !reference) return false;
  return Math.abs(bpm - reference) / reference <= tolerancePct / 100;
};

export const ALL_CAMELOT_KEYS: string[] = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
  `${n}A`,
  `${n}B`,
]);
