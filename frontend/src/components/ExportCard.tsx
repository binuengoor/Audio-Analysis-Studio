import React, { useState } from 'react';
import { FILENAME_TOKENS, previewFilename } from '../utils/filename';

const PRESETS = [
  '{OriginalName} - {Key} - {BPM}',
  '{Camelot} - {BPM} - {OriginalName}',
  '{BPM} - {Camelot} - {OriginalName}',
];

interface ExportCardProps {
  filename: string;
  bpm: number | null;
  keyStandard: string | null;
  camelot: string | null;
  onSave: (pattern: string) => void;
}

/** Rename + tag + copy to the output folder. Collapsed by default; shows a live filename preview. */
export const ExportCard: React.FC<ExportCardProps> = ({ filename, bpm, keyStandard, camelot, onSave }) => {
  const [open, setOpen] = useState(true);
  const [pattern, setPattern] = useState(PRESETS[0]);
  const preview = previewFilename(filename, pattern, bpm, keyStandard, camelot);
  const missing = bpm == null || !camelot;

  return (
    <section className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl" aria-label="Save to library">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="export-body"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-2xl"
      >
        <span className="text-sm font-bold text-white uppercase tracking-wider">Save &amp; tag</span>
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>⌄</span>
      </button>

      {open && (
        <div id="export-body" className="px-5 pb-5 space-y-4">
          <div>
            <label htmlFor="rename-pattern" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Filename pattern
            </label>
            <input
              id="rename-pattern"
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              spellCheck={false}
              className="w-full border border-slate-700 rounded-xl px-3.5 py-2 text-sm bg-slate-950 text-white focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/40 font-mono"
            />
            <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Insert token">
              {FILENAME_TOKENS.map(({ token, hint }) => (
                <button
                  key={token}
                  type="button"
                  title={hint}
                  onClick={() => setPattern((p) => `${p}${p && !p.endsWith(' ') ? ' ' : ''}${token}`)}
                  className="px-2 py-1 rounded-md text-[11px] font-mono bg-slate-950 border border-slate-800 text-purple-300 hover:border-purple-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Pattern presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={pattern === p}
                onClick={() => setPattern(p)}
                className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                  pattern === p
                    ? 'bg-purple-600/30 text-purple-100 border-purple-500/50'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <div className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Will be saved as</div>
            <div className="text-sm text-emerald-300 font-mono break-all" aria-live="polite">{preview || '—'}</div>
            {missing && (
              <p className="text-[11px] text-amber-300/90 mt-1.5">BPM or key is unknown, so those tokens will be empty. Correct them in Overview first.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSave(pattern)}
            disabled={!preview}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-40 text-slate-950 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            Save to library
          </button>
        </div>
      )}
    </section>
  );
};
