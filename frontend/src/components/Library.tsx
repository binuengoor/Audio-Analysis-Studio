import React from 'react';
import { useAudioStore } from '../store/useAudioStore';
import { LibraryEntry } from '../types';
import { buildBackendUrl } from '../config';

export const Library: React.FC = () => {
  const {
    library,
    activeEntryId,
    selectTrack,
    deleteInput,
    deleteOutput,
    deleteEntry,
    clearLibrary,
  } = useAudioStore();

  const handleDownload = (e: React.MouseEvent, type: 'input' | 'output', path: string) => {
    e.stopPropagation();
    const url = buildBackendUrl(`/api/download/${type}/${encodeURIComponent(path)}`);
    const a = document.createElement('a');
    a.href = url;
    a.download = path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/90">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Audio Library</span>
            <span className="text-xs bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/30">
              {library.length} {library.length === 1 ? 'Track' : 'Tracks'}
            </span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Click any track to load its analysis, chords, and player above. Manage input/output files and downloads below.
          </p>
        </div>

        {library.length > 0 && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Are you sure you want to delete ALL files from the library? This cannot be undone.'
                )
              ) {
                clearLibrary();
              }
            }}
            className="px-3.5 py-1.5 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 rounded-lg text-xs font-semibold transition-colors border border-rose-500/30 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Library
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-slate-200">
          <thead className="bg-slate-950/60">
            <tr>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Original Filename
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Updated / Output Filename
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Analysis (Key / BPM / Chords)
              </th>
              <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Original File
              </th>
              <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Processed File
              </th>
              <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {library.map((entry: LibraryEntry) => {
              const isActive = activeEntryId === entry.id;

              return (
                <tr
                  key={entry.id}
                  onClick={() => selectTrack(entry)}
                  className={`transition-all cursor-pointer ${
                    isActive
                      ? 'bg-purple-600/15 border-l-4 border-l-purple-500'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  {/* Original Filename */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-white max-w-[220px] truncate" title={entry.filename}>
                          {entry.filename}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Added {new Date(entry.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Updated Filename */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {entry.output_path ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-emerald-300 max-w-[240px] truncate" title={entry.output_path}>
                          {entry.output_path}
                        </span>
                        <span className="text-[10px] text-emerald-400/80 mt-0.5">✓ ID3 Tags Embedded</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Not yet renamed</span>
                    )}
                  </td>

                  {/* Analysis Result */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {entry.analysis ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 font-bold text-xs border border-blue-500/30">
                            {entry.analysis.key_camelot}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-bold text-xs border border-purple-500/30">
                            {entry.analysis.bpm} BPM
                          </span>
                          <span className="text-xs text-slate-400">
                            {entry.analysis.key_standard}
                          </span>
                          {entry.analysis.chords && entry.analysis.chords.length > 0 && (
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                              {entry.analysis.chords.length} chords
                            </span>
                          )}
                        </div>

                        {entry.analysis.quality && (
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-emerald-400/90 font-medium bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              {entry.analysis.quality.container.codec} {entry.analysis.quality.container.bit_depth}-bit
                            </span>
                            <span className="text-purple-300 font-medium bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/20">
                              {entry.analysis.quality.mastering.lufs.toFixed(1)} LUFS
                            </span>
                            <span className={`font-semibold px-1.5 py-0.5 rounded border ${
                              entry.analysis.quality.authenticity.verdict === 'SUSPICIOUS'
                                ? 'bg-rose-950/40 text-rose-300 border-rose-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {entry.analysis.quality.authenticity.verdict}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-400/80 animate-pulse">Analyzing...</span>
                    )}
                  </td>

                  {/* Original Input Actions */}
                  <td className="px-5 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    {entry.input_path ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => handleDownload(e, 'input', entry.input_path!)}
                          title="Download Original Audio"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md transition-colors border border-slate-700 text-xs flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteInput(entry.id)}
                          title="Delete Original Audio"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 rounded-md transition-colors border border-rose-500/30 text-xs"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">None</span>
                    )}
                  </td>

                  {/* Processed Output Actions */}
                  <td className="px-5 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    {entry.output_path ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => handleDownload(e, 'output', entry.output_path!)}
                          title="Download Processed Audio (with ID3 Tags)"
                          className="p-1.5 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 rounded-md transition-colors border border-emerald-500/30 text-xs flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteOutput(entry.id)}
                          title="Delete Processed File"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 rounded-md transition-colors border border-rose-500/30 text-xs"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">—</span>
                    )}
                  </td>

                  {/* Remove Entire Entry */}
                  <td className="px-4 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      title="Remove from library"
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}

            {library.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p className="text-sm">No tracks in library yet. Drop an audio file above to analyze.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
