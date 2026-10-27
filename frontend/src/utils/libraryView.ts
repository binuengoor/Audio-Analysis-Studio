import { LibraryEntry } from '../types';
import { bpmWithin, harmonicRelation } from './harmonic';

export type SortKey = 'added' | 'name' | 'bpm' | 'key' | 'quality' | 'rating';
export type SortDir = 'asc' | 'desc';

export interface LibraryFilters {
  query: string;
  key: string; // '' = any Camelot key
  bpmMin: number | null;
  bpmMax: number | null;
  failedOnly: boolean;
  tag: string; // '' = any tag
  minRating: number; // 0 = any
  /** Camelot/BPM of the selected track: when set, keep only tracks that mix with it. */
  mixesWith: { camelot: string | null; bpm: number | null; id: string } | null;
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '',
  key: '',
  bpmMin: null,
  bpmMax: null,
  failedOnly: false,
  tag: '',
  minRating: 0,
  mixesWith: null,
};

const keySortValue = (camelot: string | null | undefined): number => {
  const m = /^(\d+)([AB])$/.exec(camelot ?? '');
  return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : Number.POSITIVE_INFINITY;
};

export const qualityRank = (entry: LibraryEntry): number => {
  const q = entry.analysis?.quality;
  if (!q) return -1;
  if (q.authenticity.verdict === 'SUSPICIOUS') return 0;
  return q.container.stated_bitrate_kbps || q.container.sample_rate_hz / 1000;
};

export const hasEngineErrors = (entry: LibraryEntry): boolean =>
  Object.keys(entry.analysis?.engine_errors ?? {}).length > 0;

export const matchesFilters = (entry: LibraryEntry, f: LibraryFilters): boolean => {
  const a = entry.analysis;
  const query = f.query.trim().toLowerCase();
  if (query) {
    const haystack = [entry.filename, entry.output_path, a?.key_standard, a?.key_camelot, entry.notes, ...(entry.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (f.key && a?.key_camelot !== f.key) return false;
  if (f.bpmMin !== null && !(a?.bpm != null && a.bpm >= f.bpmMin)) return false;
  if (f.bpmMax !== null && !(a?.bpm != null && a.bpm <= f.bpmMax)) return false;
  if (f.failedOnly && !hasEngineErrors(entry)) return false;
  if (f.tag && !(entry.tags ?? []).includes(f.tag)) return false;
  if (f.minRating && (entry.rating ?? 0) < f.minRating) return false;
  if (f.mixesWith) {
    if (entry.id === f.mixesWith.id) return false;
    if (!harmonicRelation(f.mixesWith.camelot, a?.key_camelot)) return false;
    if (f.mixesWith.bpm && !bpmWithin(a?.bpm, f.mixesWith.bpm, 8)) return false;
  }
  return true;
};

/** Entries with a missing value always sort last, regardless of direction. */
export const sortEntries = (entries: LibraryEntry[], key: SortKey, dir: SortDir): LibraryEntry[] => {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (e: LibraryEntry): number | string | null => {
    switch (key) {
      case 'name':
        return e.filename.toLowerCase();
      case 'bpm':
        return e.analysis?.bpm ?? null;
      case 'key': {
        const v = keySortValue(e.analysis?.key_camelot);
        return Number.isFinite(v) ? v : null;
      }
      case 'quality': {
        const v = qualityRank(e);
        return v < 0 ? null : v;
      }
      case 'rating':
        return e.rating ?? null;
      default:
        return e.created_at;
    }
  };
  return [...entries].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * sign;
    if (va > vb) return 1 * sign;
    return 0;
  });
};

export const filterAndSort = (
  entries: LibraryEntry[],
  filters: LibraryFilters,
  key: SortKey,
  dir: SortDir
): LibraryEntry[] => sortEntries(entries.filter((e) => matchesFilters(e, filters)), key, dir);

/** Distinct tags across the library, most used first. */
export const collectTags = (entries: LibraryEntry[]): string[] => {
  const counts = new Map<string, number>();
  entries.forEach((e) => (e.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
};
