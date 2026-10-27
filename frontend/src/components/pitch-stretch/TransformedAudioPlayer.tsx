import React from 'react';

interface TransformedAudioPlayerProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  audioUrl: string;
  filename: string | null;
  computedFilename: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onSeek: (seconds: number) => void;
  onTimeUpdate: () => void;
  onEnded: () => void;
  formatSecs: (secs: number) => string;
}

export const TransformedAudioPlayer: React.FC<TransformedAudioPlayerProps> = ({
  audioRef,
  audioUrl,
  filename,
  computedFilename,
  duration,
  currentTime,
  isPlaying,
  onTogglePlayPause,
  onSeek,
  onTimeUpdate,
  onEnded,
  formatSecs,
}) => {
  const displayFilename = filename || computedFilename;

  return (
    <div className="bg-gradient-to-r from-purple-950/40 via-slate-950 to-sky-950/40 p-4 rounded-xl border border-purple-500/40 space-y-3 shadow-inner">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        className="hidden"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Transformed Audio Ready
          </span>
          <div className="text-xs font-bold text-white mt-0.5 truncate max-w-md">
            {displayFilename}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={audioUrl}
            download={displayFilename}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Track
          </a>
        </div>
      </div>

      {/* Playback Controls & Progress Bar */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onTogglePlayPause}
          className="p-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 transition-transform active:scale-95"
        >
          {isPlaying ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M10 9v6m4-6v6"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
            </svg>
          )}
        </button>

        <div className="flex-1 space-y-1">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
          />
          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
            <span>{formatSecs(currentTime)}</span>
            <span>{formatSecs(duration || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
