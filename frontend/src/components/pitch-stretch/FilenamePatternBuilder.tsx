import React from 'react';

interface FilenamePatternBuilderProps {
  renamePattern: string;
  onPatternChange: (pattern: string) => void;
  showTagHelp: boolean;
  onToggleTagHelp: (show: boolean) => void;
  computedFilename: string;
  effKey: string;
  effCamelot: string;
  effBpm: number;
  pitchTag: string;
  tempoTag: string;
}

export const FilenamePatternBuilder: React.FC<FilenamePatternBuilderProps> = ({
  renamePattern,
  onPatternChange,
  showTagHelp,
  onToggleTagHelp,
  computedFilename,
  effKey,
  effCamelot,
  effBpm,
  pitchTag,
  tempoTag,
}) => {
  return (
    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3">
      <div className="flex justify-between items-center relative">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-teal-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Download Filename Pattern
        </span>

        {/* Tag Tooltip Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => onToggleTagHelp(!showTagHelp)}
            onMouseEnter={() => onToggleTagHelp(true)}
            onMouseLeave={() => onToggleTagHelp(false)}
            className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 bg-purple-950/40 hover:bg-purple-900/50 px-2 py-0.5 rounded border border-purple-500/30 transition-colors"
          >
            <span>ℹ️</span> Available Tags
          </button>

          {showTagHelp && (
            <div className="absolute right-0 bottom-7 w-72 bg-slate-950 border border-purple-500/40 rounded-xl p-3 shadow-2xl z-50 text-xs space-y-2 backdrop-blur-md">
              <div className="font-bold text-purple-300 border-b border-slate-800 pb-1">
                Available Filename Tokens:
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li>
                  <code className="text-emerald-300 font-mono font-semibold">{`{OriginalName}`}</code>
                  <p className="text-slate-400 text-[11px]">Original track name</p>
                </li>
                <li>
                  <code className="text-blue-300 font-mono font-semibold">{`{Key}`}</code>
                  <p className="text-slate-400 text-[11px]">
                    Shifted Key (e.g. {effKey})
                  </p>
                </li>
                <li>
                  <code className="text-purple-300 font-mono font-semibold">{`{Camelot}`}</code>
                  <p className="text-slate-400 text-[11px]">
                    Shifted Camelot (e.g. {effCamelot})
                  </p>
                </li>
                <li>
                  <code className="text-amber-300 font-mono font-semibold">{`{BPM}`}</code>
                  <p className="text-slate-400 text-[11px]">
                    Shifted Tempo (e.g. {Math.round(effBpm)})
                  </p>
                </li>
                <li>
                  <code className="text-pink-300 font-mono font-semibold">{`{Pitch}`}</code>
                  <p className="text-slate-400 text-[11px]">
                    Pitch shift tag (e.g. {pitchTag})
                  </p>
                </li>
                <li>
                  <code className="text-sky-300 font-mono font-semibold">{`{Tempo}`}</code>
                  <p className="text-slate-400 text-[11px]">
                    Speed ratio tag (e.g. {tempoTag})
                  </p>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Pattern Input & Presets */}
      <div className="space-y-2">
        <input
          type="text"
          value={renamePattern}
          onChange={(e) => onPatternChange(e.target.value)}
          className="w-full border border-slate-700 rounded-xl px-3.5 py-1.5 text-xs bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors font-mono"
          placeholder="{OriginalName} - {Key} - {BPM}"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-semibold mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => onPatternChange('{OriginalName} - {Key} - {BPM}')}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              renamePattern === '{OriginalName} - {Key} - {BPM}'
                ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {`{OriginalName} - {Key} - {BPM}`}
          </button>
          <button
            type="button"
            onClick={() => onPatternChange('{OriginalName} - {Pitch} - {Tempo}')}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              renamePattern === '{OriginalName} - {Pitch} - {Tempo}'
                ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {`{OriginalName} - {Pitch} - {Tempo}`}
          </button>
          <button
            type="button"
            onClick={() => onPatternChange('{Camelot} - {BPM} - {OriginalName}')}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              renamePattern === '{Camelot} - {BPM} - {OriginalName}'
                ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {`{Camelot} - {BPM} - {OriginalName}`}
          </button>
        </div>

        {/* Resulting Filename Live Preview */}
        <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-1.5 truncate">
          <span className="text-slate-400 font-semibold">Preview:</span>
          <span className="font-mono text-emerald-300 font-bold truncate">
            {computedFilename}
          </span>
        </div>
      </div>
    </div>
  );
};
