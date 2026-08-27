import { describe, it, expect } from 'vitest';
import {
  parseKey,
  transposeNote,
  transposeKey,
  semitonesToTargetCamelot,
} from './musicTheory';

describe('musicTheory utility functions', () => {
  describe('parseKey', () => {
    it('parses standard major key names', () => {
      expect(parseKey('C major')).toEqual({ root: 'C', isMinor: false });
      expect(parseKey('F# major')).toEqual({ root: 'F#', isMinor: false });
      expect(parseKey('Ab')).toEqual({ root: 'Ab', isMinor: false });
    });

    it('parses standard minor key names', () => {
      expect(parseKey('A minor')).toEqual({ root: 'A', isMinor: true });
      expect(parseKey('C#m')).toEqual({ root: 'C#', isMinor: true });
      expect(parseKey('Eb minor')).toEqual({ root: 'Eb', isMinor: true });
    });

    it('parses Camelot notation codes', () => {
      expect(parseKey('8A')).toEqual({ root: 'A', isMinor: true });
      expect(parseKey('8B')).toEqual({ root: 'C', isMinor: false });
      expect(parseKey('12A')).toEqual({ root: 'C#', isMinor: true });
      expect(parseKey('11B')).toEqual({ root: 'A', isMinor: false });
    });

    it('returns null for empty or invalid strings', () => {
      expect(parseKey('')).toBeNull();
      expect(parseKey('InvalidKey123')).toBeNull();
    });
  });

  describe('transposeNote', () => {
    it('shifts notes up by semitones', () => {
      expect(transposeNote('C', 2)).toBe('D');
      expect(transposeNote('A', 3)).toBe('C');
      expect(transposeNote('F#', 1)).toBe('G');
    });

    it('shifts notes down by semitones', () => {
      expect(transposeNote('C', -1)).toBe('B');
      expect(transposeNote('G', -2)).toBe('F');
    });

    it('handles full octave wrap-arounds', () => {
      expect(transposeNote('C', 12)).toBe('C');
      expect(transposeNote('C', -12)).toBe('C');
    });
  });

  describe('transposeKey', () => {
    it('transposes A minor (8A) up by 2 semitones to B minor (10A)', () => {
      const result = transposeKey('A minor', 2);
      expect(result).toEqual({ standard: 'B minor', camelot: '10A' });
    });

    it('transposes C major (8B) up by 1 semitone to C# major (3B)', () => {
      const result = transposeKey('C major', 1);
      expect(result).toEqual({ standard: 'C# major', camelot: '3B' });
    });

    it('handles negative pitch shifts', () => {
      const result = transposeKey('A minor', -2);
      expect(result).toEqual({ standard: 'G minor', camelot: '6A' });
    });
  });

  describe('semitonesToTargetCamelot', () => {
    it('calculates semitone offset from 8A (Am) to 10A (Bm)', () => {
      const diff = semitonesToTargetCamelot('8A', '10A');
      expect(diff).toBe(2);
    });

    it('calculates shortest path for Camelot shifts', () => {
      const diff = semitonesToTargetCamelot('8A', '6A');
      expect(diff).toBe(-2);
    });
  });
});
