import { describe, it, expect } from 'vitest';
import { bpmWithin, compatibleKeys, harmonicRelation, parseCamelot } from './harmonic';

describe('harmonic helpers', () => {
  it('parses valid Camelot codes only', () => {
    expect(parseCamelot('8a')).toEqual({ number: 8, letter: 'A' });
    expect(parseCamelot('12B')).toEqual({ number: 12, letter: 'B' });
    expect(parseCamelot('13A')).toBeNull();
    expect(parseCamelot('0B')).toBeNull();
    expect(parseCamelot(null)).toBeNull();
  });

  it('lists compatible keys and wraps around the wheel', () => {
    expect(compatibleKeys('8A').sort()).toEqual(['7A', '8A', '8B', '9A']);
    expect(compatibleKeys('12B').sort()).toEqual(['11B', '12A', '12B', '1B']);
    expect(compatibleKeys('1A').sort()).toEqual(['12A', '1A', '1B', '2A']);
    expect(compatibleKeys('nope')).toEqual([]);
  });

  it('classifies relations', () => {
    expect(harmonicRelation('8A', '8A')).toBe('same');
    expect(harmonicRelation('8A', '9A')).toBe('adjacent');
    expect(harmonicRelation('12A', '1A')).toBe('adjacent');
    expect(harmonicRelation('8A', '8B')).toBe('relative');
    expect(harmonicRelation('8A', '9B')).toBeNull();
    expect(harmonicRelation('8A', null)).toBeNull();
  });

  it('checks BPM tolerance', () => {
    expect(bpmWithin(124, 120, 6)).toBe(true);
    expect(bpmWithin(130, 120, 6)).toBe(false);
    expect(bpmWithin(null, 120)).toBe(false);
  });
});
