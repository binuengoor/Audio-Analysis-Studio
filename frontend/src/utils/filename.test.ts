import { describe, it, expect } from 'vitest';
import { previewFilename } from './filename';

describe('previewFilename', () => {
  it('substitutes tokens and keeps the extension', () => {
    expect(previewFilename('My Song.mp3', '{Camelot} - {BPM} - {OriginalName}', 125.4, 'A minor', '8A')).toBe('8A - 125 - My Song.mp3');
  });
  it('strips filesystem-unsafe characters but keeps #', () => {
    expect(previewFilename('x.wav', '{Key}: {OriginalName}?', 120, 'C# minor', '12A')).toBe('C# minor x.wav');
  });
  it('leaves missing values blank rather than inventing them', () => {
    expect(previewFilename('x.flac', '{OriginalName} - {BPM} - {Camelot}', null, null, null)).toBe('x -  -.flac');
  });
});
