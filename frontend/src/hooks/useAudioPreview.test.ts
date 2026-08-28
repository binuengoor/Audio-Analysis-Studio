import { describe, it, expect } from 'vitest';
import { formatAudioDuration } from './useAudioPreview';

describe('formatAudioDuration helper', () => {
  it('formats seconds into MM:SS correctly', () => {
    expect(formatAudioDuration(0)).toBe('0:00');
    expect(formatAudioDuration(9)).toBe('0:09');
    expect(formatAudioDuration(65)).toBe('1:05');
    expect(formatAudioDuration(600)).toBe('10:00');
    expect(formatAudioDuration(-5)).toBe('0:00');
    expect(formatAudioDuration(NaN)).toBe('0:00');
  });
});
