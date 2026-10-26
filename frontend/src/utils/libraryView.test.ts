import { describe, it, expect } from 'vitest';
import { LibraryEntry } from '../types';
import { EMPTY_FILTERS, filterAndSort } from './libraryView';

const entry = (id: string, filename: string, bpm: number | null, camelot: string | null, created = 1, errors = {}): LibraryEntry => ({
  id,
  filename,
  input_path: filename,
  output_path: null,
  created_at: created,
  status: 'completed',
  analysis: {
    bpm,
    bpm_confidence: 0.9,
    key_camelot: camelot,
    key_standard: camelot ? 'x' : null,
    key_confidence: 0.9,
    duration: 100,
    engine_errors: errors,
  },
});

const lib = [
  entry('a', 'Alpha.mp3', 124, '8A', 1),
  entry('b', 'Bravo.mp3', 128, '9A', 2),
  entry('c', 'Charlie.mp3', null, null, 3, { bpm: 'down' }),
  entry('d', 'Delta.mp3', 90, '3B', 4),
];

describe('library view', () => {
  it('sorts with missing values last in both directions', () => {
    expect(filterAndSort(lib, EMPTY_FILTERS, 'bpm', 'asc').map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(filterAndSort(lib, EMPTY_FILTERS, 'bpm', 'desc').map((e) => e.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts by camelot wheel order', () => {
    expect(filterAndSort(lib, EMPTY_FILTERS, 'key', 'asc').map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('searches by name and key', () => {
    expect(filterAndSort(lib, { ...EMPTY_FILTERS, query: 'brav' }, 'added', 'asc').map((e) => e.id)).toEqual(['b']);
    expect(filterAndSort(lib, { ...EMPTY_FILTERS, query: '3b' }, 'added', 'asc').map((e) => e.id)).toEqual(['d']);
  });

  it('filters by bpm range, key and failures', () => {
    expect(filterAndSort(lib, { ...EMPTY_FILTERS, bpmMin: 100, bpmMax: 126 }, 'added', 'asc').map((e) => e.id)).toEqual(['a']);
    expect(filterAndSort(lib, { ...EMPTY_FILTERS, key: '9A' }, 'added', 'asc').map((e) => e.id)).toEqual(['b']);
    expect(filterAndSort(lib, { ...EMPTY_FILTERS, failedOnly: true }, 'added', 'asc').map((e) => e.id)).toEqual(['c']);
  });

  it('finds tracks that mix with the selected one', () => {
    const f = { ...EMPTY_FILTERS, mixesWith: { id: 'a', camelot: '8A', bpm: 124 } };
    expect(filterAndSort(lib, f, 'added', 'asc').map((e) => e.id)).toEqual(['b']);
  });
});
