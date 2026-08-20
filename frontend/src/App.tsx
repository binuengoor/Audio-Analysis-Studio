import { useEffect, useState, useRef } from 'react';
import { UploadZone } from './components/UploadZone';
import { WaveformPlayer, WaveformPlayerHandle } from './components/WaveformPlayer';
import { ChordProgression } from './components/ChordProgression';
import { Library } from './components/Library';
import { useAudioStore } from './store/useAudioStore';

function App() {
  const {
    activeTitle,
    activeAnalysis,
    activeAudioUrl,
    isAnalyzing,
    fetchLibrary,
    reanalyzeTrack,
    processOutput,
  } = useAudioStore();

  const [renamePattern, setRenamePattern] = useState('{OriginalName} - {Key} - {BPM}');
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const playerRef = useRef<WaveformPlayerHandle>(null);

  // Fetch library on initial mount
  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const handleSeek = (timestamp: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(timestamp);
      playerRef.current.play();
    }
  };

  const handleReanalyze = () => {
    if (activeTitle) {
      reanalyzeTrack(activeTitle);
    }
  };

  const handleProcess = () => {
    if (activeTitle && activeAnalysis) {
      processOutput(
        activeTitle,
        renamePattern,
        activeAnalysis.bpm,
        activeAnalysis.key_standard,
        activeAnalysis.key_camelot
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-500 to-sky-400 rounded-xl shadow-md shadow-purple-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Audio Analysis Studio
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                  Multi-Engine Microservices • BeatNet BPM • MusicalKeyCNN Key • Madmom Chords
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Microservices Live
            </span>
          </div>
        </header>

        {/* Top Section: Upload & Active Analysis */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Upload & Quick Track Status */}
          <div className="lg:col-span-4 space-y-6">
            <UploadZone />

            {/* Active Track Summary Box */}
            {activeTitle && (
              <div className="border border-slate-800 rounded-2xl bg-slate-900/80 p-5 shadow-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Selected Track
                    </span>
                    <h3 className="text-sm font-bold text-white truncate max-w-[200px] mt-0.5" title={activeTitle}>
                      {activeTitle}
                    </h3>
                  </div>

                  <button
                    onClick={handleReanalyze}
                    disabled={isAnalyzing}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                      isAnalyzing
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 cursor-wait'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <svg
                      className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-amber-300' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {isAnalyzing ? 'Re-analyzing...' : 'Re-analyze'}
                  </button>
                </div>

                {activeAnalysis && (
                  <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t border-slate-800">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Key</div>
                      <div className="text-base font-bold text-blue-300 mt-0.5">{activeAnalysis.key_camelot}</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Tempo</div>
                      <div className="text-base font-bold text-purple-300 mt-0.5">{activeAnalysis.bpm} BPM</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Key/BPM Cards, Chords & Waveform Player */}
          <div className="lg:col-span-8 space-y-6">
            {activeTitle ? (
              <div className="space-y-6">
                
                {/* Metric Cards */}
                {activeAnalysis ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Camelot Key */}
                    <div className="bg-gradient-to-br from-blue-950/40 to-slate-900 p-4 rounded-2xl border border-blue-500/30 text-center shadow-lg shadow-blue-500/5">
                      <div className="text-[11px] text-blue-300 uppercase font-bold tracking-wider mb-1">
                        Camelot Key
                      </div>
                      <div className="text-3xl font-extrabold text-white">{activeAnalysis.key_camelot}</div>
                      <div className="text-[11px] text-slate-400 mt-1 truncate">{activeAnalysis.key_standard}</div>
                    </div>

                    {/* BPM */}
                    <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 p-4 rounded-2xl border border-purple-500/30 text-center shadow-lg shadow-purple-500/5">
                      <div className="text-[11px] text-purple-300 uppercase font-bold tracking-wider mb-1">
                        BPM (Tempo)
                      </div>
                      <div className="text-3xl font-extrabold text-white">{activeAnalysis.bpm}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {activeAnalysis.bpm_confidence ? `${Math.round(activeAnalysis.bpm_confidence * 100)}% conf` : 'BeatNet Offline'}
                      </div>
                    </div>

                    {/* Standard Key */}
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center shadow-lg">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                        Standard Key
                      </div>
                      <div className="text-lg font-bold text-white mt-1 truncate">{activeAnalysis.key_standard}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {activeAnalysis.key_confidence ? `${Math.round(activeAnalysis.key_confidence * 100)}% conf` : 'KeyNet'}
                      </div>
                    </div>

                    {/* Duration & Chords Count */}
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center shadow-lg">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                        Duration
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {activeAnalysis.duration ? `${activeAnalysis.duration.toFixed(1)}s` : '—'}
                      </div>
                      <div className="text-[11px] text-purple-300 mt-1">
                        {activeAnalysis.chords?.length || 0} Chord Segments
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 p-8 rounded-2xl border border-slate-800 text-center space-y-3">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="text-sm font-semibold text-slate-300">
                      Analyzing audio with AI models (BeatNet, MusicalKeyCNN, Madmom)...
                    </p>
                  </div>
                )}

                {/* Chord Progression Interactive Section */}
                {activeAnalysis && activeAnalysis.chords && (
                  <ChordProgression
                    chords={activeAnalysis.chords}
                    onSeek={handleSeek}
                    currentTime={currentPlaybackTime}
                  />
                )}

                {/* File Renaming & ID3 Embedding Bar */}
                {activeAnalysis && (
                  <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                      <div className="flex-1 relative">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Output Filename Pattern
                        </label>
                        <input
                          type="text"
                          value={renamePattern}
                          onChange={(e) => setRenamePattern(e.target.value)}
                          className="w-full border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                          placeholder="{OriginalName} - {Key} - {BPM}"
                        />
                      </div>

                      <div className="sm:self-end">
                        <button
                          onClick={handleProcess}
                          className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Save to Library
                        </button>
                      </div>
                    </div>

                    {/* Quick Pattern Presets */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400 text-[11px] font-semibold">Presets:</span>
                      <button
                        onClick={() => setRenamePattern('{OriginalName} - {Key} - {BPM}')}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                          renamePattern === '{OriginalName} - {Key} - {BPM}'
                            ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                      >
                        {`{OriginalName} - {Key} - {BPM}`} (Default)
                      </button>
                      <button
                        onClick={() => setRenamePattern('{Camelot} - {BPM} - {OriginalName}')}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                          renamePattern === '{Camelot} - {BPM} - {OriginalName}'
                            ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                      >
                        {`{Camelot} - {BPM} - {OriginalName}`}
                      </button>
                      <button
                        onClick={() => setRenamePattern('{BPM} - {Camelot} - {OriginalName}')}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                          renamePattern === '{BPM} - {Camelot} - {OriginalName}'
                            ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                      >
                        {`{BPM} - {Camelot} - {OriginalName}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Waveform Player */}
                {activeAudioUrl && (
                  <div className="space-y-2">
                    <WaveformPlayer
                      ref={playerRef}
                      audioUrl={activeAudioUrl}
                      onTimeUpdate={setCurrentPlaybackTime}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl p-12 bg-slate-900/40 text-center">
                <svg className="w-16 h-16 mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-base font-semibold text-slate-400">No track selected for analysis</p>
                <p className="text-xs text-slate-500 mt-1">Drop audio files above or pick a track from your library below</p>
              </div>
            )}
          </div>
        </section>

        {/* Bottom Section: Full Library Management */}
        <section className="pt-4">
          <Library />
        </section>

      </div>
    </div>
  );
}

export default App;
