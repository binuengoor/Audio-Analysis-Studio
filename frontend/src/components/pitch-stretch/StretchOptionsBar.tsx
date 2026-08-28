import React from 'react';

interface StretchOptionsBarProps {
  preserveFormants: boolean;
  onPreserveFormantsChange: (checked: boolean) => void;
  outputFormat: string;
  onOutputFormatChange: (fmt: string) => void;
  isProcessing: boolean;
  onProcess: () => void;
  disabled: boolean;
}

export const StretchOptionsBar: React.FC<StretchOptionsBarProps> = ({
  preserveFormants,
  onPreserveFormantsChange,
  outputFormat,
  onOutputFormatChange,
  isProcessing,
  onProcess,
  disabled,
}) => {
  return (
    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
        {/* Formant Preservation Toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={preserveFormants}
            onChange={(e) => onPreserveFormantsChange(e.target.checked)}
            className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-900 w-4 h-4"
          />
          <span className="font-semibold text-slate-200">Preserve Vocal Formants</span>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            (Prevents chipmunk timbre)
          </span>
        </label>

        {/* Output Format Picker */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Format:</span>
          <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            {['wav', 'flac', 'mp3'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onOutputFormatChange(f)}
                className={`px-2.5 py-0.5 rounded uppercase text-[10px] font-bold transition-colors ${
                  outputFormat === f
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Process Action Button */}
      <button
        type="button"
        onClick={onProcess}
        disabled={disabled || isProcessing}
        className={`px-6 py-2.5 rounded-xl font-extrabold text-sm shadow-lg transition-all flex items-center gap-2 ${
          isProcessing
            ? 'bg-purple-800 text-purple-300 cursor-wait'
            : 'bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white shadow-purple-500/20'
        }`}
      >
        {isProcessing ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing with Rubber Band v4...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Apply Pitch & Tempo Stretch
          </>
        )}
      </button>
    </div>
  );
};
