import React, { useState } from 'react';
import { SectionSegment } from '../types';

interface SongStructureProps {
  segments?: SectionSegment[];
  onSeek?: (timestamp: number) => void;
  currentTime?: number;
}

export const SongStructure: React.FC<SongStructureProps> = ({
  segments = [],
  onSeek,
  currentTime = 0,
}) => {
  // Collapsed by default as requested
  const [isExpanded, setIsExpanded] = useState(false);

  if (!segments || segments.length === 0) {
    return null;
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="p-2 bg-pink-500/15 rounded-lg border border-pink-500/30 text-pink-300 group-hover:border-pink-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider group-hover:text-pink-300 transition-colors">
                Song Structure & Sections
              </h3>
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                {segments.length} sections
              </span>
              <svg
                className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform duration-200 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Librosa & scikit-learn Laplacian Segmentation Engine
            </p>
          </div>
        </button>

        {isExpanded && (
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Click any section pill to jump playback
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="pt-2 border-t border-slate-800/80 space-y-3">
          <div className="flex flex-wrap gap-2">
            {segments.map((seg, idx) => {
              const isActive = currentTime >= seg.start && currentTime <= seg.end;
              const durationSec = Math.round(seg.end - seg.start);

              return (
                <button
                  key={idx}
                  onClick={() => onSeek && onSeek(seg.start)}
                  style={{
                    backgroundColor: isActive
                      ? seg.color.replace('0.20', '0.45').replace('0.25', '0.50')
                      : seg.color,
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'border-white/50 text-white ring-2 ring-pink-500/50 shadow-lg shadow-pink-500/20 scale-105'
                      : 'border-white/10 text-slate-300 hover:text-white hover:border-white/30'
                  }`}
                  title={`Jump to ${formatTime(seg.start)} (${seg.label})`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70"></span>
                    {seg.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-300/80 font-normal bg-black/30 px-1.5 py-0.5 rounded">
                    {formatTime(seg.start)} - {formatTime(seg.end)} ({durationSec}s)
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 text-right">
            💡 Laplacian Agglomerative Graph Segmentation (Intro, Verse, Chorus, Bridge, Outro)
          </p>
        </div>
      )}
    </div>
  );
};
