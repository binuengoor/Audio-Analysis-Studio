import React from 'react';
import { TransposedKey } from '../../utils/musicTheory';

interface PitchTranspositionCardProps {
  pitchSemitones: number;
  onPitchChange: (semitones: number) => void;
  shiftedKey: TransposedKey | null;
  detectedKeyStandard?: string;
  detectedKeyCamelot?: string;
}

export const PitchTranspositionCard: React.FC<PitchTranspositionCardProps> = ({
  pitchSemitones,
  onPitchChange,
  shiftedKey,
  detectedKeyStandard,
  detectedKeyCamelot,
}) => {
  return (
    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          Pitch Transposition
        </span>
        <span className="text-sm font-mono font-extrabold text-blue-300 bg-blue-950/60 border border-blue-500/30 px-2.5 py-0.5 rounded-lg">
          {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitones
        </span>
      </div>

      {/* Pitch Slider */}
      <div className="space-y-1.5">
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={pitchSemitones}
          onChange={(e) => onPitchChange(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>-12 st (-1 Octave)</span>
          <span>0 (Original)</span>
          <span>+12 st (+1 Octave)</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap gap-1.5">
        {[-3, -2, -1, 0, 1, 2, 3].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => onPitchChange(st)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
              pitchSemitones === st
                ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
          >
            {st === 0 ? 'Reset (0)' : st > 0 ? `+${st} st` : `${st} st`}
          </button>
        ))}
      </div>

      {/* Transposed Key Feedback */}
      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
        <span className="text-slate-400">Estimated Shifted Key:</span>
        {shiftedKey ? (
          <span className="font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
            {shiftedKey.standard} ({shiftedKey.camelot})
          </span>
        ) : (
          <span className="text-slate-400 font-medium font-mono">
            {detectedKeyStandard
              ? `${detectedKeyStandard} (${detectedKeyCamelot || ''})`
              : 'Original Key'}
          </span>
        )}
      </div>
    </div>
  );
};
