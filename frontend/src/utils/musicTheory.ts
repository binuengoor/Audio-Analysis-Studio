/**
 * Music Theory and Harmonic Mixing Utility Functions
 * Supports Camelot Wheel calculations, semitone transposition, and note helpers.
 */

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// 12 Camelot positions for Major (B) keys: 1B=B, 2B=F#, 3B=Db, 4B=Ab, 5B=Eb, 6B=Bb, 7B=F, 8B=C, 9B=G, 10B=D, 11B=A, 12B=E
export const CAMELOT_MAJOR: Record<string, string> = {
  'B': '1B', 'B major': '1B', 'B:maj': '1B',
  'F#': '2B', 'F# major': '2B', 'Gb': '2B', 'Gb major': '2B', 'F#:maj': '2B', 'Gb:maj': '2B',
  'Db': '3B', 'Db major': '3B', 'C#': '3B', 'C# major': '3B', 'Db:maj': '3B', 'C#:maj': '3B',
  'Ab': '4B', 'Ab major': '4B', 'G#': '4B', 'G# major': '4B', 'Ab:maj': '4B', 'G#:maj': '4B',
  'Eb': '5B', 'Eb major': '5B', 'D#': '5B', 'D# major': '5B', 'Eb:maj': '5B', 'D#:maj': '5B',
  'Bb': '6B', 'Bb major': '6B', 'A#': '6B', 'A# major': '6B', 'Bb:maj': '6B', 'A#:maj': '6B',
  'F': '7B', 'F major': '7B', 'F:maj': '7B',
  'C': '8B', 'C major': '8B', 'C:maj': '8B',
  'G': '9B', 'G major': '9B', 'G:maj': '9B',
  'D': '10B', 'D major': '10B', 'D:maj': '10B',
  'A': '11B', 'A major': '11B', 'A:maj': '11B',
  'E': '12B', 'E major': '12B', 'E:maj': '12B',
};

// 12 Camelot positions for Minor (A) keys: 1A=Abm, 2A=Ebm, 3A=Bbm, 4A=Fm, 5A=Cm, 6A=Gm, 7A=Dm, 8A=Am, 9A=Em, 10A=Bm, 11A=F#m, 12A=D#m/C#m
export const CAMELOT_MINOR: Record<string, string> = {
  'Abm': '1A', 'Ab minor': '1A', 'G#m': '1A', 'G# minor': '1A', 'Ab:min': '1A', 'G#:min': '1A',
  'Ebm': '2A', 'Eb minor': '2A', 'D#m': '2A', 'D# minor': '2A', 'Eb:min': '2A', 'D#:min': '2A',
  'Bbm': '3A', 'Bb minor': '3A', 'A#m': '3A', 'A# minor': '3A', 'Bb:min': '3A', 'A#:min': '3A',
  'Fm': '4A', 'F minor': '4A', 'F:min': '4A',
  'Cm': '5A', 'C minor': '5A', 'C:min': '5A',
  'Gm': '6A', 'G minor': '6A', 'G:min': '6A',
  'Dm': '7A', 'D minor': '7A', 'D:min': '7A',
  'Am': '8A', 'A minor': '8A', 'A:min': '8A',
  'Em': '9A', 'E minor': '9A', 'E:min': '9A',
  'Bm': '10A', 'B minor': '10A', 'B:min': '10A',
  'F#m': '11A', 'F# minor': '11A', 'Gbm': '11A', 'Gb minor': '11A', 'F#:min': '11A', 'Gb:min': '11A',
  'C#m': '12A', 'C# minor': '12A', 'Dbm': '12A', 'Db minor': '12A', 'C#:min': '12A', 'Db:min': '12A',
};

// Camelot to standard key lookup
export const CAMELOT_TO_STANDARD: Record<string, string> = {
  '1A': 'Ab minor', '2A': 'Eb minor', '3A': 'Bb minor', '4A': 'F minor',
  '5A': 'C minor',  '6A': 'G minor',  '7A': 'D minor',  '8A': 'A minor',
  '9A': 'E minor',  '10A': 'B minor', '11A': 'F# minor', '12A': 'C# minor',
  '1B': 'B major',  '2B': 'F# major', '3B': 'Db major', '4B': 'Ab major',
  '5B': 'Eb major', '6B': 'Bb major', '7B': 'F major',  '8B': 'C major',
  '9B': 'G major',  '10B': 'D major', '11B': 'A major',  '12B': 'E major',
};

// Semitone map from C = 0
export const NOTE_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

/**
 * Parses a key string (e.g. "C# minor", "Ab", "8A", "F:maj") into root note and mode.
 */
export function parseKey(keyStr: string): { root: string; isMinor: boolean } | null {
  if (!keyStr) return null;
  const clean = keyStr.trim();

  // If already camelot code (e.g. "8A", "11B")
  if (/^([1-9]|1[0-2])[AB]$/i.test(clean)) {
    const std = CAMELOT_TO_STANDARD[clean.toUpperCase()];
    if (std) return parseKey(std);
  }

  const isMinor = /minor|min|m$/i.test(clean) && !/major|maj/i.test(clean);

  // Extract root note part (e.g. "C#", "Ab", "F")
  const rootMatch = clean.match(/^([A-Ga-g][#b]?)/);
  if (!rootMatch) return null;

  const rawRoot = rootMatch[1];
  const root = rawRoot.charAt(0).toUpperCase() + (rawRoot.charAt(1) || '');
  return { root, isMinor };
}

/**
 * Transposes a note name by a specified number of semitones.
 */
export function transposeNote(note: string, semitones: number): string {
  const normalizedSemitones = ((semitones % 12) + 12) % 12;
  const baseSemitone = NOTE_TO_SEMITONE[note];
  if (baseSemitone === undefined) return note;

  const targetSemitone = (baseSemitone + normalizedSemitones) % 12;
  return NOTES_SHARP[targetSemitone];
}

/**
 * Transposes a full key (e.g. "A minor", "8A") by semitones and returns standard key and Camelot key.
 */
export function transposeKey(keyStr: string, semitones: number): { standard: string; camelot: string } | null {
  const parsed = parseKey(keyStr);
  if (!parsed) return null;

  const newRoot = transposeNote(parsed.root, semitones);
  const standard = `${newRoot} ${parsed.isMinor ? 'minor' : 'major'}`;

  let camelot = 'Unknown';
  if (parsed.isMinor) {
    camelot = CAMELOT_MINOR[standard] || CAMELOT_MINOR[`${newRoot}m`] || 'Unknown';
  } else {
    camelot = CAMELOT_MAJOR[standard] || CAMELOT_MAJOR[newRoot] || 'Unknown';
  }

  return { standard, camelot };
}

/**
 * Calculates the shortest semitone shift needed to move from a source key to a target Camelot key.
 */
export function semitonesToTargetCamelot(sourceKey: string, targetCamelot: string): number | null {
  const targetStandard = CAMELOT_TO_STANDARD[targetCamelot];
  if (!targetStandard) return null;

  const src = parseKey(sourceKey);
  const tgt = parseKey(targetStandard);
  if (!src || !tgt) return null;

  const srcSemi = NOTE_TO_SEMITONE[src.root];
  const tgtSemi = NOTE_TO_SEMITONE[tgt.root];
  if (srcSemi === undefined || tgtSemi === undefined) return null;

  let diff = (tgtSemi - srcSemi) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;

  return diff;
}
