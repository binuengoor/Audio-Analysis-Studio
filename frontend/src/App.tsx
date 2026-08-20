import { useEffect, useState, useRef } from 'react';
import { UploadZone } from './components/UploadZone';
import { WaveformPlayer, WaveformPlayerHandle } from './components/WaveformPlayer';
import { ChordProgression } from './components/ChordProgression';
import { QualityAnalysis } from './components/QualityAnalysis';
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
  const [showTagHelp, setShowTagHelp] = useState(false);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans flex flex-col justify-between">
      <div className="max-w-7xl mx-auto space-y-8 w-full">
        
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex-shrink-0 shadow-lg shadow-purple-500/20 rounded-xl overflow-hidden border border-slate-700/60">
                <svg viewBox="0 0 512 512" className="w-full h-full">
                  <rect width="512" height="512" rx="128" fill="#111827" />
                  <g fill="url(#headerBrandGradient)">
                    <rect x="164" y="176" width="40" height="220" rx="20" />
                    <rect x="236" y="116" width="40" height="280" rx="20" />
                    <rect x="308" y="176" width="40" height="220" rx="20" />
                    <rect x="164" y="276" width="184" height="40" rx="20" />
                  </g>
                  <defs>
                    <linearGradient id="headerBrandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06B6D4" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Audio Analysis Studio
                </h1>
                <div className="text-slate-400 text-xs sm:text-sm mt-0.5 space-y-0.5 leading-snug">
                  <p>Multi-Engine Microservices • BeatNet BPM • MusicalKeyCNN Key • Madmom Chords</p>
                  <p className="text-slate-500">• Laplacian Structure • WhatsMyBitrate Quality & Spectrograms • Mutagen ID3 Tagging</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full font-medium flex items-center gap-1.5 whitespace-nowrap shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Microservices Live
            </span>
          </div>
        </header>

        {/* Top Section: Upload & Active Analysis */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Upload, Track Summary & Renaming Pattern */}
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

            {/* Output Filename Pattern Box (Moved under Selected Track) */}
            {activeAnalysis && (
              <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5 relative">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Output Filename Pattern
                    </label>

                    {/* More Info Hover / Click Tooltip */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTagHelp(!showTagHelp)}
                        onMouseEnter={() => setShowTagHelp(true)}
                        onMouseLeave={() => setShowTagHelp(false)}
                        className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 bg-purple-950/40 hover:bg-purple-900/50 px-2 py-0.5 rounded border border-purple-500/30 transition-colors"
                      >
                        <span>ℹ️</span> Available Tags
                      </button>

                      {showTagHelp && (
                        <div className="absolute right-0 top-6 w-64 bg-slate-950 border border-purple-500/40 rounded-xl p-3 shadow-2xl z-50 text-xs space-y-2 backdrop-blur-md">
                          <div className="font-bold text-purple-300 border-b border-slate-800 pb-1">
                            Available Filename Tokens:
                          </div>
                          <ul className="space-y-1.5 text-slate-300 text-[11px]">
                            <li>
                              <code className="text-emerald-300 font-mono font-semibold">{`{OriginalName}`}</code>
                              <p className="text-slate-400 text-[10px]">Original uploaded filename</p>
                            </li>
                            <li>
                              <code className="text-blue-300 font-mono font-semibold">{`{Key}`}</code>
                              <p className="text-slate-400 text-[10px]">Standard Key (e.g. C# minor, F major)</p>
                            </li>
                            <li>
                              <code className="text-purple-300 font-mono font-semibold">{`{Camelot}`}</code>
                              <p className="text-slate-400 text-[10px]">Camelot Wheel (e.g. 12A, 7B)</p>
                            </li>
                            <li>
                              <code className="text-amber-300 font-mono font-semibold">{`{BPM}`}</code>
                              <p className="text-slate-400 text-[10px]">Detected tempo (e.g. 125.0)</p>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={renamePattern}
                    onChange={(e) => setRenamePattern(e.target.value)}
                    className="w-full border border-slate-700 rounded-xl px-3.5 py-2 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                    placeholder="{OriginalName} - {Key} - {BPM}"
                  />
                </div>

                {/* Quick Pattern Presets */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 text-[11px] font-semibold block">Presets:</span>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setRenamePattern('{OriginalName} - {Key} - {BPM}')}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition-colors ${
                        renamePattern === '{OriginalName} - {Key} - {BPM}'
                          ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {`{OriginalName} - {Key} - {BPM}`} (Default)
                    </button>
                    <button
                      onClick={() => setRenamePattern('{Camelot} - {BPM} - {OriginalName}')}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition-colors ${
                        renamePattern === '{Camelot} - {BPM} - {OriginalName}'
                          ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {`{Camelot} - {BPM} - {OriginalName}`}
                    </button>
                    <button
                      onClick={() => setRenamePattern('{BPM} - {Camelot} - {OriginalName}')}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition-colors ${
                        renamePattern === '{BPM} - {Camelot} - {OriginalName}'
                          ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {`{BPM} - {Camelot} - {OriginalName}`}
                    </button>
                  </div>
                </div>

                {/* Save to Library Action Button */}
                <button
                  onClick={handleProcess}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Save to Library
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Key/BPM Cards, Chords, Waveform & Quality Specs */}
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

                    {/* Duration, Chords & Structure Count */}
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center shadow-lg">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                        Duration
                      </div>
                      <div className="text-lg font-bold text-white mt-1">
                        {activeAnalysis.duration ? `${activeAnalysis.duration.toFixed(1)}s` : '—'}
                      </div>
                      <div className="text-[11px] text-purple-300 mt-1 truncate">
                        {activeAnalysis.chords?.length || 0} Chords • {activeAnalysis.segments?.length || 0} Sections
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 p-8 rounded-2xl border border-slate-800 text-center space-y-3">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="text-sm font-semibold text-slate-300">
                      Analyzing audio with AI models (BeatNet, MusicalKeyCNN, Madmom, Structure, Quality)...
                    </p>
                  </div>
                )}

                {/* Waveform Player */}
                {activeAudioUrl && (
                  <div className="space-y-2">
                    <WaveformPlayer
                      ref={playerRef}
                      audioUrl={activeAudioUrl}
                      segments={activeAnalysis?.segments}
                      onTimeUpdate={setCurrentPlaybackTime}
                    />
                  </div>
                )}

                {/* Chord Progression Interactive Section (Collapsible) */}
                {activeAnalysis && activeAnalysis.chords && (
                  <ChordProgression
                    chords={activeAnalysis.chords}
                    onSeek={handleSeek}
                    currentTime={currentPlaybackTime}
                  />
                )}

                {/* Audio Quality & Mastering Specs (Collapsible) */}
                {activeAnalysis && activeAnalysis.quality && (
                  <QualityAnalysis quality={activeAnalysis.quality} />
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

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span>Built with ❤️ for music creators, DJs, and audio engineers.</span>
            <span className="text-slate-700">•</span>
            <span>Special thanks to the awesome open-source community & upstream audio intelligence projects.</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-slate-400 text-[11px]">
            <a
              href="https://github.com/binuengoor/Audio-Analysis-Studio"
              target="_blank"
              rel="noreferrer"
              className="hover:text-purple-300 transition-colors flex items-center gap-1.5 font-medium"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub Repository
            </a>
            <span className="text-slate-700">•</span>
            <span>MIT License</span>
          </div>
        </footer>

      </div>
    </div>
  );
}

export default App;
