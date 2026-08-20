import React, { useState } from 'react';
import { ChordSegment } from '../types';

interface ChordProgressionProps {
  chords?: ChordSegment[];
  onSeek?: (timestamp: number) => void;
  currentTime?: number;
}

export const ChordProgression: React.FC<ChordProgressionProps> = ({
  chords = [],
  onSeek,
  currentTime = 0,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'summary'>('timeline');
  const [isExpanded, setIsExpanded] = useState(true);

  if (!chords || chords.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center text-slate-500 text-sm">
        No chord progression detected yet.
      </div>
    );
  }

  // Generate unique consecutive chord flow (e.g., F#:min -> G#:maj -> C#:min)
  const summaryChords: string[] = [];
  chords.forEach((c) => {
    if (summaryChords.length === 0 || summaryChords[summaryChords.length - 1] !== c.chord) {
      summaryChords.push(c.chord);
    }
  });

  const getChordBadgeStyle = (chord: string, isCurrent: boolean) => {
    if (isCurrent) {
      return 'bg-amber-500 text-slate-950 border-amber-300 font-bold scale-105 shadow-lg shadow-amber-500/20';
    }
    if (chord.includes(':min') || chord.endsWith('m')) {
      return 'bg-purple-950/60 text-purple-200 border-purple-500/30 hover:border-purple-400 hover:bg-purple-900/60';
    }
    if (chord.includes(':maj') || chord.includes('maj')) {
      return 'bg-blue-950/60 text-blue-200 border-blue-500/30 hover:border-blue-400 hover:bg-blue-900/60';
    }
    if (chord === 'N') {
      return 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:border-slate-600';
    }
    return 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30 hover:border-emerald-400';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-left group focus:outline-none"
        >
          <span className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 group-hover:text-purple-300 transition-colors">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            Chord Progression
          </span>
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            {chords.length} segments
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
        </button>

        {isExpanded && (
          <div className="flex gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 rounded transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-purple-600 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`px-2.5 py-1 rounded transition-colors ${
                viewMode === 'summary'
                  ? 'bg-purple-600 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Harmonic Flow
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {viewMode === 'summary' ? (
            <div className="flex flex-wrap items-center gap-2 py-2">
              {summaryChords.map((chord, idx) => (
                <React.Fragment key={idx}>
                  <span
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${getChordBadgeStyle(
                      chord,
                      false
                    )}`}
                  >
                    {chord.replace(':maj', '').replace(':min', 'm')}
                  </span>
                  {idx < summaryChords.length - 1 && (
                    <span className="text-slate-600 font-bold text-xs">→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                {chords.map((c, index) => {
                  const isCurrent = currentTime >= c.start && currentTime < c.end;
                  const cleanChord = c.chord.replace(':maj', '').replace(':min', 'm');
                  const duration = (c.end - c.start).toFixed(1);

                  return (
                    <button
                      key={index}
                      onClick={() => onSeek && onSeek(c.start)}
                      title={`Jump to ${c.start.toFixed(1)}s (${c.chord})`}
                      className={`flex-shrink-0 flex flex-col items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer min-w-[70px] ${getChordBadgeStyle(
                        c.chord,
                        isCurrent
                      )}`}
                    >
                      <span className="text-base font-bold">{cleanChord}</span>
                      <div className="flex flex-col items-center text-[10px] opacity-75 mt-1 font-mono">
                        <span>{c.start.toFixed(1)}s</span>
                        <span className="text-[9px] opacity-60">+{duration}s</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 text-right">
                💡 Click any chord to seek audio preview to that section
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
