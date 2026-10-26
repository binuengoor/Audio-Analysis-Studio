/** Mirrors backend `generate_new_filename` so the UI can preview the saved name. */
export const FILENAME_TOKENS = [
  { token: '{OriginalName}', hint: 'Original filename without extension' },
  { token: '{Key}', hint: 'Standard key, e.g. C# minor' },
  { token: '{Camelot}', hint: 'Camelot code, e.g. 12A' },
  { token: '{BPM}', hint: 'Tempo rounded to a whole number' },
] as const;

export const previewFilename = (
  original: string,
  pattern: string,
  bpm: number | null,
  key: string | null,
  camelot: string | null
): string => {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot) : '';
  const name = pattern
    .split('{OriginalName}').join(base)
    .split('{Key}').join(key ?? '')
    .split('{Camelot}').join(camelot ?? '')
    .split('{BPM}').join(bpm ? String(Math.round(bpm)) : '');
  return `${name.replace(/[<>:"/\\|?*]/g, '').trim()}${ext}`;
};
