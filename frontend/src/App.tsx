import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadZone } from './components/UploadZone';
import { WaveformPlayer, WaveformPlayerHandle } from './components/WaveformPlayer';
import { SongStructure } from './components/SongStructure';
import { PitchTimeStretch } from './components/PitchTimeStretch';
import { ChordProgression } from './components/ChordProgression';
import { QualityAnalysis } from './components/QualityAnalysis';
import { ServiceHealthBadge } from './components/ServiceHealthBadge';
import { Library } from './components/Library';
import { ToastContainer } from './components/Toast';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { Tabs, TabDef } from './components/Tabs';
import { AnalysisEditor } from './components/AnalysisEditor';
import { ExportCard } from './components/ExportCard';
import { MetaEditor } from './components/MetaEditor';
import { useAudioStore } from './store/useAudioStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { AUTH_REQUIRED_EVENT } from './config';
import { filterAndSort, EMPTY_FILTERS, collectTags } from './utils/libraryView';
import { harmonicRelation } from './utils/harmonic';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 5 s (Shift: 15 s)'],
  ['1 – 5', 'Switch analysis tab'],
  ['J / K', 'Next / previous track'],
  ['/', 'Search library'],
  ['?', 'Show this help'],
];

const TAB_IDS = ['overview', 'harmony', 'structure', 'quality', 'transform'] as const;
type TabId = (typeof TAB_IDS)[number];

const metricCard = 'p-4 rounded-2xl border text-center shadow-lg';

function App() {
  const {
    library,
    activeEntryId,
    activeTitle,
    activeAnalysis,
    activeAudioUrl,
    isAnalyzing,
    fetchLibrary,
    reanalyzeTrack,
    processOutput,
    overrideAnalysis,
    updateMeta,
    selectTrack,
  } = useAudioStore();

  const [tab, setTab] = useState<TabId>('overview');
  const [showHelp, setShowHelp] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const playerRef = useRef<WaveformPlayerHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowHelp(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

  const hasChords = !!activeAnalysis?.chords?.length;
  const hasSegments = !!activeAnalysis?.segments?.length;
  const hasQuality = !!activeAnalysis?.quality;

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', hint: '1' },
    { id: 'harmony', label: 'Harmony', hint: hasChords ? String(activeAnalysis!.chords!.length) : '2', disabled: !hasChords },
    { id: 'structure', label: 'Structure', hint: hasSegments ? String(activeAnalysis!.segments!.length) : '3', disabled: !hasSegments },
    { id: 'quality', label: 'Quality', hint: '4', disabled: !hasQuality },
    { id: 'transform', label: 'Pitch & tempo', hint: '5', disabled: !activeTitle },
  ];
  const currentTab: TabId = tabs.find((t) => t.id === tab)?.disabled ? 'overview' : tab;

  const activeEntry = library.find((e) => e.id === activeEntryId) ?? null;

  const mixes = useMemo(() => {
    const camelot = activeAnalysis?.key_camelot;
    if (!activeEntry || !camelot) return [];
    const matches = filterAndSort(
      library,
      { ...EMPTY_FILTERS, mixesWith: { id: activeEntry.id, camelot, bpm: activeAnalysis?.bpm ?? null } },
      'bpm',
      'asc'
    );
    const bpm = activeAnalysis?.bpm;
    return bpm ? [...matches].sort((a, b) => Math.abs((a.analysis?.bpm ?? 0) - bpm) - Math.abs((b.analysis?.bpm ?? 0) - bpm)) : matches;
  }, [library, activeEntry, activeAnalysis?.key_camelot, activeAnalysis?.bpm]);

  const handleSeek = (timestamp: number) => {
    playerRef.current?.seekTo(timestamp);
    playerRef.current?.play();
  };

  useKeyboardShortcuts({
    togglePlay: () => playerRef.current?.togglePlay(),
    seekBy: (s) => playerRef.current?.seekBy(s),
    focusSearch: () => searchRef.current?.focus(),
    selectTab: (i) => {
      const target = tabs[i];
      if (target && !target.disabled) setTab(target.id as TabId);
    },
    selectRelative: (delta) => {
      if (library.length === 0) return;
      const idx = library.findIndex((e) => e.id === activeEntryId);
      const next = library[Math.min(library.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta))];
      if (next) selectTrack(next);
    },
    toggleHelp: () => setShowHelp((v) => !v),
  });

  const a = activeAnalysis;
  const failedEngines = a?.engine_errors ? Object.keys(a.engine_errors) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8 font-sans">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[10001] focus:bg-purple-600 focus:text-white focus:px-3 focus:py-2 focus:rounded-lg">
        Skip to analysis
      </a>
      <div className="max-w-7xl mx-auto space-y-6 w-full">
        {/* Header */}
        <header className="relative z-40 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 px-5 py-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 flex-shrink-0 shadow-lg shadow-purple-500/20 rounded-xl overflow-hidden border border-slate-700/60">
              <img src="/logo.svg" alt="" className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">Audio Analysis Studio</h1>
              <p className="text-slate-400 text-xs">Key · BPM · Chords · Structure · Quality · Pitch &amp; tempo</p>
            </div>
          </div>

          {a && activeTitle && (
            <div className="hidden md:flex items-center gap-2 min-w-0 max-w-sm" aria-label="Selected track summary">
              <span className="truncate text-sm text-slate-300" title={activeTitle}>{activeTitle}</span>
              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 font-bold text-xs border border-blue-500/30">{a.key_camelot ?? '—'}</span>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-bold text-xs border border-purple-500/30 whitespace-nowrap">{a.bpm ?? '—'} BPM</span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            <ServiceHealthBadge />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT))}
              title="Set API key"
              aria-label="Set API key"
              className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              🔑
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              ?
            </button>
          </div>
        </header>

        <main id="main" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload (top-left on desktop, first on mobile) */}
          <div className="lg:col-span-4 lg:col-start-1 lg:row-start-1">
            <UploadZone />
          </div>

          {/* Right column */}
          <div className="lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-2 space-y-4 min-w-0">
            {activeTitle ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Selected track</span>
                    <h2 className="text-lg font-bold text-white truncate" title={activeTitle}>{activeTitle}</h2>
                  </div>
                  <button
                    onClick={() => reanalyzeTrack(activeTitle)}
                    disabled={isAnalyzing}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                      isAnalyzing ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 cursor-wait' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <span aria-hidden className={isAnalyzing ? 'inline-block animate-spin' : ''}>⟳</span>
                    {isAnalyzing ? 'Analyzing…' : 'Re-analyze'}
                  </button>
                </div>

                {/* Sticky player stays visible while you read the analysis */}
                {activeAudioUrl && (
                  <div className="lg:sticky lg:top-2 z-30">
                    <WaveformPlayer ref={playerRef} audioUrl={activeAudioUrl} segments={a?.segments} onTimeUpdate={setCurrentPlaybackTime} />
                  </div>
                )}

                {failedEngines.length > 0 && (
                  <div role="alert" className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 text-sm">
                    <span aria-hidden>⚠</span>
                    <div className="flex-1">
                      <p className="font-semibold">{failedEngines.join(', ')} analysis failed — values shown as “—” are not guesses.</p>
                      <p className="text-xs text-amber-300/80 mt-0.5">Check the service status badge, retry, or enter the value yourself in Overview.</p>
                    </div>
                    <button
                      onClick={() => reanalyzeTrack(activeTitle)}
                      disabled={isAnalyzing}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {a ? (
                  <>
                    <Tabs tabs={tabs} active={currentTab} onChange={(id) => setTab(id as TabId)} label="Analysis sections" />
                    <div role="tabpanel" id={`panel-${currentTab}`} aria-labelledby={`tab-${currentTab}`} className="space-y-4 pt-1">
                      {currentTab === 'overview' && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className={`${metricCard} bg-gradient-to-br from-blue-950/40 to-slate-900 border-blue-500/30`}>
                              <div className="text-[11px] text-blue-300 uppercase font-bold tracking-wider mb-1">Camelot key</div>
                              <div className="text-3xl font-extrabold text-white">{a.key_camelot ?? '—'}</div>
                              <div className="text-[11px] text-slate-400 mt-1 truncate">{a.key_standard ?? 'Key engine failed'}</div>
                            </div>
                            <div className={`${metricCard} bg-gradient-to-br from-purple-950/40 to-slate-900 border-purple-500/30`}>
                              <div className="text-[11px] text-purple-300 uppercase font-bold tracking-wider mb-1">BPM</div>
                              <div className="text-3xl font-extrabold text-white">{a.bpm ?? '—'}</div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                {a.manual_overrides?.includes('bpm') ? 'edited by you' : a.bpm_confidence != null ? `${Math.round(a.bpm_confidence * 100)}% confidence` : 'BPM engine failed'}
                              </div>
                            </div>
                            <div className={`${metricCard} bg-slate-900 border-slate-800`}>
                              <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Key confidence</div>
                              <div className="text-2xl font-bold text-white mt-1">{a.key_confidence != null ? `${Math.round(a.key_confidence * 100)}%` : '—'}</div>
                              <div className="text-[11px] text-slate-400 mt-1">{a.manual_overrides?.includes('key') ? 'edited by you' : 'MusicalKeyCNN'}</div>
                            </div>
                            <div className={`${metricCard} bg-slate-900 border-slate-800`}>
                              <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Duration</div>
                              <div className="text-2xl font-bold text-white mt-1">
                                {a.duration ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, '0')}` : '—'}
                              </div>
                              <div className="text-[11px] text-purple-300 mt-1 truncate">{a.chords?.length ?? 0} {a.chords?.length === 1 ? 'chord' : 'chords'} · {a.segments?.length ?? 0} {a.segments?.length === 1 ? 'section' : 'sections'}</div>
                            </div>
                          </div>

                          {activeEntry && (
                            <AnalysisEditor analysis={a} disabled={isAnalyzing} onSave={(patch) => overrideAnalysis(activeEntry.id, patch)} />
                          )}

                          {activeEntry && (
                            <MetaEditor entry={activeEntry} knownTags={collectTags(library)} onSave={(patch) => updateMeta(activeEntry.id, patch)} />
                          )}

                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Mixes well with</h3>
                            {!a.key_camelot ? (
                              <p className="text-sm text-slate-400">Set a key above to find harmonic matches in your library.</p>
                            ) : mixes.length === 0 ? (
                              <p className="text-sm text-slate-400">No other tracks in your library are within ±1 key and ±8% BPM of this one yet.</p>
                            ) : (
                              <ul className="grid sm:grid-cols-2 gap-2">
                                {mixes.slice(0, 6).map((m) => (
                                  <li key={m.id}>
                                    <button
                                      onClick={() => selectTrack(m)}
                                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                                    >
                                      <span className="truncate text-sm text-slate-200" title={m.filename}>{m.filename}</span>
                                      <span className="flex-shrink-0 text-[11px] font-semibold text-sky-300 whitespace-nowrap">
                                        {m.analysis?.key_camelot} · {m.analysis?.bpm} · {harmonicRelation(a.key_camelot, m.analysis?.key_camelot) === 'relative' ? 'rel' : harmonicRelation(a.key_camelot, m.analysis?.key_camelot) === 'same' ? 'same' : '±1'}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </>
                      )}

                      {currentTab === 'harmony' && hasChords && <ChordProgression chords={a.chords} onSeek={handleSeek} currentTime={currentPlaybackTime} defaultExpanded />}
                      {currentTab === 'structure' && hasSegments && <SongStructure segments={a.segments} onSeek={handleSeek} currentTime={currentPlaybackTime} defaultExpanded />}
                      {currentTab === 'quality' && a.quality && <QualityAnalysis quality={a.quality} defaultExpanded />}
                      {currentTab === 'transform' && (
                        <PitchTimeStretch
                          key={activeTitle}
                          filename={activeTitle}
                          detectedBpm={a.bpm ?? undefined}
                          detectedKeyStandard={a.key_standard ?? undefined}
                          detectedKeyCamelot={a.key_camelot ?? undefined}
                          defaultExpanded
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-slate-900/60 p-8 rounded-2xl border border-slate-800 text-center space-y-3" role="status">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
                    <p className="text-sm font-semibold text-slate-300">Analyzing… tempo, key, chords, structure and quality run in parallel.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="min-h-[300px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-800 rounded-2xl p-12 bg-slate-900/40 text-center">
                <p className="text-base font-semibold text-slate-300">No track selected</p>
                <p className="text-sm text-slate-400 mt-1">Drop an audio file or paste a URL on the left, or pick a track from the library below.</p>
              </div>
            )}
          </div>
          {/* Export: under the upload on desktop, after the analysis on mobile */}
          {activeTitle && a && (
            <div className="lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:self-start">
              <ExportCard
                filename={activeTitle}
                bpm={a.bpm}
                keyStandard={a.key_standard}
                camelot={a.key_camelot}
                onSave={(pattern) => processOutput(activeTitle, pattern, a.bpm, a.key_standard, a.key_camelot)}
              />
            </div>
          )}
        </main>

        <Library searchInputRef={searchRef} />

        <footer className="pt-6 border-t border-slate-800/80 text-center text-xs text-slate-400 space-y-2">
          <div>Built for music creators, DJs and audio engineers — powered by open-source audio research.</div>
          <div className="flex items-center justify-center gap-3 text-slate-400">
            <a href="https://github.com/binuengoor/Audio-Analysis-Studio" target="_blank" rel="noreferrer" className="hover:text-purple-300 focus:outline-none focus-visible:underline">GitHub</a>
            <span className="text-slate-700">•</span>
            <span>MIT License</span>
          </div>
        </footer>

        <ToastContainer />
        <ApiKeyDialog />

        {showHelp && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowHelp(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 id="help-title" className="text-lg font-bold text-white mb-3">Keyboard shortcuts</h2>
              <dl className="space-y-2 text-sm">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex justify-between gap-4">
                    <dt><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs">{keys}</kbd></dt>
                    <dd className="text-slate-400 text-right">{what}</dd>
                  </div>
                ))}
              </dl>
              <button autoFocus onClick={() => setShowHelp(false)} className="mt-5 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
