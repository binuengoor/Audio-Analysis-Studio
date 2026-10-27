import React, { useEffect, useState } from 'react';
import { AnalysisResult } from '../types';
import { CAMELOT_TO_STANDARD } from '../utils/musicTheory';
import { ALL_CAMELOT_KEYS } from '../utils/harmonic';

interface AnalysisEditorProps {
  analysis: AnalysisResult;
  disabled?: boolean;
  onSave: (patch: { bpm?: number; key_camelot?: string; key_standard?: string }) => Promise<boolean>;
}

/** Lets the user correct the detected BPM (incl. half/double-time) and key. Corrections survive re-analysis. */
export const AnalysisEditor: React.FC<AnalysisEditorProps> = ({ analysis, disabled, onSave }) => {
  const [bpm, setBpm] = useState(analysis.bpm != null ? String(analysis.bpm) : '');
  const [camelot, setCamelot] = useState(analysis.key_camelot ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBpm(analysis.bpm != null ? String(analysis.bpm) : '');
    setCamelot(analysis.key_camelot ?? '');
  }, [analysis.bpm, analysis.key_camelot]);

  const parsed = Number(bpm);
  const bpmValid = bpm !== '' && Number.isFinite(parsed) && parsed >= 20 && parsed <= 400;
  const bpmChanged = bpmValid && parsed !== analysis.bpm;
  const keyChanged = camelot !== '' && camelot !== (analysis.key_camelot ?? '');
  const scale = (factor: number) => {
    if (!Number.isFinite(parsed) || bpm === '') return;
    setBpm(String(Math.round(parsed * factor * 10) / 10));
  };

  const save = async () => {
    const patch: { bpm?: number; key_camelot?: string; key_standard?: string } = {};
    if (bpmChanged) patch.bpm = parsed;
    if (keyChanged) {
      patch.key_camelot = camelot;
      patch.key_standard = CAMELOT_TO_STANDARD[camelot];
    }
    setSaving(true);
    await onSave(patch);
    setSaving(false);
  };

  const overridden = analysis.manual_overrides ?? [];
  const field =
    'bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/40';
  const step = 'px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Correct detection</h3>
        {overridden.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            edited: {overridden.join(' + ')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="edit-bpm" className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">BPM</label>
          <div className="flex items-center gap-1.5">
            <button type="button" className={step} onClick={() => scale(0.5)} disabled={disabled || bpm === ''} aria-label="Halve BPM" title="Half-time">÷2</button>
            <input
              id="edit-bpm"
              type="number"
              inputMode="decimal"
              min={20}
              max={400}
              step={0.1}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              aria-invalid={bpm !== '' && !bpmValid}
              className={`${field} w-24 text-center ${bpm !== '' && !bpmValid ? 'border-rose-500' : ''}`}
              disabled={disabled}
            />
            <button type="button" className={step} onClick={() => scale(2)} disabled={disabled || bpm === ''} aria-label="Double BPM" title="Double-time">×2</button>
          </div>
        </div>
        <div>
          <label htmlFor="edit-key" className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Camelot key</label>
          <select id="edit-key" value={camelot} onChange={(e) => setCamelot(e.target.value)} className={`${field} w-40`} disabled={disabled}>
            {camelot === '' && <option value="">— unknown —</option>}
            {ALL_CAMELOT_KEYS.map((k) => (
              <option key={k} value={k}>{k} · {CAMELOT_TO_STANDARD[k]}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled || saving || !(bpmChanged || keyChanged)}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
        >
          {saving ? 'Saving…' : 'Save correction'}
        </button>
      </div>
    </div>
  );
};
