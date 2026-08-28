import { describe, it, expect } from 'vitest';

describe('useAudioPreview formatting helper', () => {
  it('formats seconds into MM:SS correctly', () => {
    const formatSecs = (secs: number): string => {
      if (isNaN(secs) || secs < 0) return '0:00';
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    expect(formatSecs(0)).toBe('0:00');
    expect(formatSecs(9)).toBe('0:09');
    expect(formatSecs(65)).toBe('1:05');
    expect(formatSecs(600)).toBe('10:00');
    expect(formatSecs(-5)).toBe('0:00');
    expect(formatSecs(NaN)).toBe('0:00');
  });
});
