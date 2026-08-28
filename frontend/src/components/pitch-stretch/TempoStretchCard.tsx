import React from 'react';

interface TempoStretchCardProps {
  tempoRatio: number;
  onTempoRatioChange: (ratio: number) => void;
  targetBpmInput: string;
  onTargetBpmInputChange: (val: string) => void;
  detectedBpm?: number;
}

export const TempoStretchCard: React.FC<TempoStretchCardProps> = ({
  tempoRatio,
  onTempoRatioChange,
  targetBpmInput,
  onTargetBpmInputChange,
  detectedBpm = 120,
}) => {
  return (
    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          Tempo / Time Stretch
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-extrabold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-lg">
            {tempoRatio.toFixed(2)}x ({Math.round(tempoRatio * 100)}%)
          </span>
        </div>
      </div>

      {/* Tempo Slider */}
      <div className="space-y-1.5">
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.05"
          value={tempoRatio}
          onChange={(e) => onTempoRatioChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>0.50x (50% Slower)</span>
          <span>1.00x (Original)</span>
          <span>2.00x (200% Faster)</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap gap-1.5">
        {[0.75, 0.85, 0.9, 1.0, 1.1, 1.25, 1.5].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onTempoRatioChange(r)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
              tempoRatio === r
                ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
          >
            {r === 1.0 ? '1.0x (100%)' : `${r}x`}
          </button>
        ))}
      </div>

      {/* Target BPM & Original BPM */}
      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
        <span className="text-slate-400">Target Tempo:</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            <input
              type="number"
              min="30"
              max="300"
              step="1"
              value={targetBpmInput}
              onChange={(e) => onTargetBpmInputChange(e.target.value)}
              className="w-12 bg-transparent text-amber-300 font-mono font-bold text-xs focus:outline-none text-right"
            />
            <span className="text-[10px] text-slate-400">BPM</span>
          </div>
          <span className="text-[10px] text-slate-500">
            (Orig: {detectedBpm || 120})
          </span>
        </div>
      </div>
    </div>
  );
};
