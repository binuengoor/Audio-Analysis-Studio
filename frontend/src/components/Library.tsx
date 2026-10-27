import React, { useEffect, useMemo, useState } from 'react';
import { useAudioStore } from '../store/useAudioStore';
import { LibraryEntry } from '../types';
import { apiFetch, buildFileUrl } from '../config';
import { ALL_CAMELOT_KEYS, harmonicRelation } from '../utils/harmonic';
import {
  EMPTY_FILTERS,
  LibraryFilters,
  SortDir,
  SortKey,
  filterAndSort,
  collectTags,
  hasEngineErrors,
  qualityRank,
} from '../utils/libraryView';

interface LibraryProps {
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400';
const control = `bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:border-purple-500 ${focusRing}`;

const COLUMNS: { key: SortKey | null; label: string; align?: string }[] = [
  { key: 'name', label: 'Track' },
  { key: 'key', label: 'Key' },
  { key: 'bpm', label: 'BPM' },
  { key: 'quality', label: 'Quality' },
  { key: 'rating', label: 'Rating' },
  { key: null, label: 'Files', align: 'text-center' },
  { key: 'added', label: 'Added' },
  { key: null, label: '', align: 'text-center' },
];

export const Library: React.FC<LibraryProps> = ({ searchInputRef }) => {
  const { library, activeEntryId, selectTrack, deleteInput, deleteOutput, deleteEntry, clearLibrary } = useAudioStore();
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('added');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [mixMode, setMixMode] = useState(false);
  const [dupMode, setDupMode] = useState(false);
  const [dupGroups, setDupGroups] = useState<LibraryEntry[][]>([]);
  const [showExport, setShowExport] = useState(false);
  const [pathPrefix, setPathPrefix] = useState(() => {
    try {
      return localStorage.getItem('aas.rekordboxPrefix') ?? '';
    } catch {
      return '';
    }
  });
  const showToast = useAudioStore((s) => s.showToast);
  const allTags = useMemo(() => collectTags(library), [library]);

  // Duplicates are computed server-side by content hash; refresh whenever the mode is on and the library changes
  useEffect(() => {
    if (!dupMode) return;
    let cancelled = false;
    apiFetch('/api/library/duplicates')
      .then((r) => (r.ok ? r.json() : []))
      .then((groups: LibraryEntry[][]) => !cancelled && setDupGroups(groups))
      .catch(() => !cancelled && setDupGroups([]));
    return () => {
      cancelled = true;
    };
  }, [dupMode, library]);

  // In each duplicate group the best copy (highest quality, then oldest) is the one to keep
  const dupInfo = useMemo(() => {
    const info = new Map<string, { group: number; best: boolean }>();
    dupGroups.forEach((group, gi) => {
      const live = group.map((g) => library.find((e) => e.id === g.id)).filter(Boolean) as LibraryEntry[];
      const best = [...live].sort((a, b) => qualityRank(b) - qualityRank(a) || a.created_at - b.created_at)[0];
      live.forEach((e) => info.set(e.id, { group: gi, best: e.id === best?.id }));
    });
    return info;
  }, [dupGroups, library]);

  const active = library.find((e) => e.id === activeEntryId) ?? null;
  const effectiveFilters: LibraryFilters = {
    ...filters,
    mixesWith:
      mixMode && active?.analysis?.key_camelot
        ? { id: active.id, camelot: active.analysis.key_camelot, bpm: active.analysis.bpm }
        : null,
  };

  const rows = useMemo(() => {
    const sorted = filterAndSort(library, effectiveFilters, sortKey, sortDir);
    if (!dupMode) return sorted;
    // keep duplicates together: order by group, best copy first
    return sorted
      .filter((e) => dupInfo.has(e.id))
      .sort((a, b) => dupInfo.get(a.id)!.group - dupInfo.get(b.id)!.group || Number(dupInfo.get(b.id)!.best) - Number(dupInfo.get(a.id)!.best));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, filters, sortKey, sortDir, mixMode, dupMode, dupInfo, activeEntryId, active?.analysis?.key_camelot, active?.analysis?.bpm]);

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) || mixMode || dupMode;

  const exportLibrary = (format: 'csv' | 'json' | 'rekordbox') => {
    const params = new URLSearchParams({ format });
    // export exactly what is on screen when a filter is active
    if (rows.length !== library.length) params.set('ids', rows.map((r) => r.id).join(','));
    if (format === 'rekordbox' && pathPrefix.trim()) params.set('path_prefix', pathPrefix.trim());
    try {
      localStorage.setItem('aas.rekordboxPrefix', pathPrefix.trim());
    } catch {
      /* storage unavailable */
    }
    const a = document.createElement('a');
    a.href = buildFileUrl(`/api/export/library?${params.toString()}`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowExport(false);
    showToast(`Exporting ${rows.length} track${rows.length === 1 ? '' : 's'} as ${format === 'rekordbox' ? 'Rekordbox XML' : format.toUpperCase()}`, 'info');
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'added' ? 'desc' : 'asc');
    }
  };

  const num = (v: string): number | null => (v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  const handleDownload = (e: React.MouseEvent, type: 'input' | 'output', path: string) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = buildFileUrl(`/api/download/${type}/${encodeURIComponent(path)}`);
    a.download = path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const iconBtn = `p-1.5 rounded-md border transition-colors ${focusRing}`;

  return (
    <section aria-label="Audio library" className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl">
      <div className="p-5 border-b border-slate-800 bg-slate-900/90 rounded-t-2xl space-y-4">
        <div className="flex justify-between items-center gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Library
            <span className="text-xs bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/30 font-normal">
              {isFiltered ? `${rows.length} of ${library.length}` : library.length} {library.length === 1 ? 'track' : 'tracks'}
            </span>
          </h2>
          <div className="flex items-center gap-2 relative">
          {library.length > 0 && (
            <>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={showExport}
                onClick={() => setShowExport(!showExport)}
                className={`px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-semibold border border-slate-700 ${focusRing}`}
              >
                Export ▾
              </button>
              {showExport && (
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-40 w-72 bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-2"
                  onKeyDown={(e) => e.key === 'Escape' && setShowExport(false)}
                >
                  <p className="text-[11px] text-slate-400">
                    {rows.length === library.length ? 'Whole library' : `${rows.length} filtered tracks`} · analysed tracks only
                  </p>
                  <button role="menuitem" onClick={() => exportLibrary('csv')} className={`w-full text-left px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-sm ${focusRing}`}>CSV <span className="text-slate-400 text-xs">spreadsheet</span></button>
                  <button role="menuitem" onClick={() => exportLibrary('json')} className={`w-full text-left px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-sm ${focusRing}`}>JSON <span className="text-slate-400 text-xs">full analysis</span></button>
                  <div className="rounded-lg bg-slate-900 p-2 space-y-1.5">
                    <button role="menuitem" onClick={() => exportLibrary('rekordbox')} className={`w-full text-left px-1 py-1 rounded text-sm ${focusRing}`}>Rekordbox XML <span className="text-slate-400 text-xs">BPM + key</span></button>
                    <label htmlFor="rb-prefix" className="block text-[11px] uppercase text-slate-400">Folder of ./data on your DJ computer</label>
                    <input
                      id="rb-prefix"
                      value={pathPrefix}
                      onChange={(e) => setPathPrefix(e.target.value)}
                      placeholder="/Users/me/Audio-Analysis-Studio/data"
                      className={`${control} w-full font-mono`}
                    />
                    <p className="text-[11px] text-slate-400">Without it, track paths point inside the Docker container. Beat grids are not exported.</p>
                  </div>
                </div>
              )}
            </>
          )}
          {library.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Delete ALL files from the library? This cannot be undone.')) clearLibrary();
              }}
              className={`px-3 py-1.5 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 rounded-lg text-xs font-semibold border border-rose-500/30 ${focusRing}`}
            >
              Clear library
            </button>
          )}
          </div>
        </div>

        {library.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="search">
            <label className="sr-only" htmlFor="lib-search">Search library</label>
            <input
              id="lib-search"
              ref={searchInputRef}
              type="search"
              placeholder="Search name, key, tag, note…  ( / )"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              className={`${control} w-56`}
            />
            <label className="sr-only" htmlFor="lib-key">Filter by key</label>
            <select id="lib-key" value={filters.key} onChange={(e) => setFilters({ ...filters, key: e.target.value })} className={control}>
              <option value="">Any key</option>
              {ALL_CAMELOT_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <label className="sr-only" htmlFor="lib-bpm-min">Minimum BPM</label>
            <input id="lib-bpm-min" type="number" placeholder="BPM min" min={0} value={filters.bpmMin ?? ''} onChange={(e) => setFilters({ ...filters, bpmMin: num(e.target.value) })} className={`${control} w-24`} />
            <span className="text-slate-600" aria-hidden>–</span>
            <label className="sr-only" htmlFor="lib-bpm-max">Maximum BPM</label>
            <input id="lib-bpm-max" type="number" placeholder="BPM max" min={0} value={filters.bpmMax ?? ''} onChange={(e) => setFilters({ ...filters, bpmMax: num(e.target.value) })} className={`${control} w-24`} />

            {allTags.length > 0 && (
              <>
                <label className="sr-only" htmlFor="lib-tag">Filter by tag</label>
                <select id="lib-tag" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} className={control}>
                  <option value="">Any tag</option>
                  {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              </>
            )}
            <label className="sr-only" htmlFor="lib-rating">Minimum rating</label>
            <select id="lib-rating" value={filters.minRating} onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })} className={control}>
              <option value={0}>Any rating</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{n < 5 ? ' & up' : ''}</option>)}
            </select>
            <button
              type="button"
              aria-pressed={mixMode}
              disabled={!active?.analysis?.key_camelot}
              onClick={() => setMixMode(!mixMode)}
              title={active?.analysis?.key_camelot ? `Tracks compatible with ${active.analysis.key_camelot} @ ${active.analysis.bpm ?? '?'} BPM` : 'Select an analyzed track first'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 ${focusRing} ${
                mixMode ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              ♫ Mixes with selected
            </button>
            <button
              type="button"
              aria-pressed={filters.failedOnly}
              onClick={() => setFilters({ ...filters, failedOnly: !filters.failedOnly })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${focusRing} ${
                filters.failedOnly ? 'bg-amber-500/20 text-amber-200 border-amber-400/50' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              ⚠ Needs attention
            </button>
            <button
              type="button"
              aria-pressed={dupMode}
              onClick={() => setDupMode(!dupMode)}
              title="Byte-identical files, with the best copy marked"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${focusRing} ${
                dupMode ? 'bg-rose-500/20 text-rose-200 border-rose-400/50' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              ⧉ Duplicates{dupMode ? ` (${dupInfo.size})` : ''}
            </button>
            {isFiltered && (
              <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setMixMode(false); setDupMode(false); }} className={`text-xs text-slate-400 hover:text-white underline ${focusRing}`}>
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-b-2xl">
        <table className="min-w-full divide-y divide-slate-800 text-slate-200">
          <thead className="bg-slate-950/60">
            <tr>
              {COLUMNS.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  aria-sort={col.key && col.key === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${col.align ?? ''}`}
                >
                  {col.key ? (
                    <button type="button" onClick={() => toggleSort(col.key!)} className={`inline-flex items-center gap-1 uppercase hover:text-white ${focusRing} rounded`}>
                      {col.label}
                      <span aria-hidden className={col.key === sortKey ? 'text-purple-300' : 'text-slate-700'}>
                        {col.key === sortKey ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {rows.map((entry: LibraryEntry) => {
              const isActive = activeEntryId === entry.id;
              const a = entry.analysis;
              const relation = active && !isActive ? harmonicRelation(active.analysis?.key_camelot, a?.key_camelot) : null;
              const q = a?.quality;
              const failed = hasEngineErrors(entry);

              return (
                <tr
                  key={entry.id}
                  tabIndex={0}
                  aria-selected={isActive}
                  onClick={() => selectTrack(entry)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      selectTrack(entry);
                    }
                  }}
                  className={`cursor-pointer transition-colors ${focusRing} focus-visible:ring-inset ${
                    isActive ? 'bg-purple-600/15 shadow-[inset_4px_0_0_0_theme(colors.purple.500)]' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm text-white max-w-[260px] truncate" title={entry.filename}>{entry.filename}</div>
                    {entry.output_path && (
                      <div className="text-[11px] text-emerald-300/90 max-w-[260px] truncate" title={entry.output_path}>→ {entry.output_path}</div>
                    )}
                    {(entry.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 max-w-[260px]">
                        {entry.tags!.map((t) => (
                          <span key={t} className="text-[11px] px-1.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">#{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {a ? (
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-xs border ${a.key_camelot ? 'bg-blue-500/20 text-blue-200 border-blue-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {a.key_camelot ?? '—'}
                        </span>
                        {relation && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30" title="Harmonic match with the selected track">
                            {relation === 'same' ? 'same' : relation === 'relative' ? 'relative' : '±1'}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{a.key_standard ?? ''}</span>
                        {dupMode && dupInfo.get(entry.id) && (
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded border ${dupInfo.get(entry.id)!.best ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30' : 'bg-rose-950/50 text-rose-300 border-rose-500/30'}`}
                            title={`Duplicate set ${dupInfo.get(entry.id)!.group + 1}`}
                          >
                            {dupInfo.get(entry.id)!.best ? 'keep' : 'dup'} #{dupInfo.get(entry.id)!.group + 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-400/80 animate-pulse">Analyzing…</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold">
                    {a ? (
                      <>
                        <span className={a.bpm == null ? 'text-slate-400' : 'text-purple-200'}>{a.bpm ?? '—'}</span>
                        {a.manual_overrides?.includes('bpm') && <span className="ml-1 text-[11px] text-emerald-300" title="Edited by you">✎</span>}
                      </>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      {q && (
                        <>
                          <span className="text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            {q.container.codec} {q.container.bit_depth}-bit
                          </span>
                          <span className="text-purple-300 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/20">{q.mastering.lufs.toFixed(1)} LUFS</span>
                          {q.authenticity.verdict === 'SUSPICIOUS' && (
                            <span className="font-semibold px-1.5 py-0.5 rounded border bg-rose-950/40 text-rose-300 border-rose-500/30">SUSPICIOUS</span>
                          )}
                        </>
                      )}
                      {failed && (
                        <span
                          className="bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30"
                          title={Object.entries(a!.engine_errors!).map(([k, v]) => `${k}: ${v}`).join('\n')}
                        >
                          ⚠ {Object.keys(a!.engine_errors!).join(', ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm" title={entry.notes || undefined}>
                    {entry.rating ? (
                      <span className="text-amber-300" aria-label={`${entry.rating} of 5 stars`}>{'★'.repeat(entry.rating)}<span className="text-slate-700">{'★'.repeat(5 - entry.rating)}</span></span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {entry.notes && <span className="ml-1 text-slate-400" aria-label="Has notes">✎</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {entry.input_path && (
                        <>
                          <button onClick={(e) => handleDownload(e, 'input', entry.input_path!)} aria-label={`Download original ${entry.filename}`} title="Download original" className={`${iconBtn} bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700`}><DownloadIcon /></button>
                          <button onClick={() => deleteInput(entry.id)} aria-label={`Delete original ${entry.filename}`} title="Delete original" className={`${iconBtn} bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border-rose-500/30`}><TrashIcon /></button>
                        </>
                      )}
                      {entry.output_path && (
                        <>
                          <button onClick={(e) => handleDownload(e, 'output', entry.output_path!)} aria-label={`Download processed ${entry.output_path}`} title="Download processed (tagged)" className={`${iconBtn} bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/30`}><DownloadIcon /></button>
                          <button onClick={() => deleteOutput(entry.id)} aria-label={`Delete processed ${entry.output_path}`} title="Delete processed" className={`${iconBtn} bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border-rose-500/30`}><TrashIcon /></button>
                        </>
                      )}
                      {!entry.input_path && !entry.output_path && <span className="text-[11px] text-slate-400">none</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400">
                    {new Date(entry.created_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove "${entry.filename}" and its files from the library?`)) deleteEntry(entry.id);
                      }}
                      aria-label={`Remove ${entry.filename} from library`}
                      title="Remove from library"
                      className={`text-slate-400 hover:text-rose-400 p-1 rounded ${focusRing}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-slate-400">
                  {library.length === 0 ? (
                    <p className="text-sm">No tracks yet. Drop an audio file or paste a URL above to analyze it.</p>
                  ) : (
                    <p className="text-sm">
                      No tracks match these filters.{' '}
                      <button className={`underline text-slate-300 ${focusRing}`} onClick={() => { setFilters(EMPTY_FILTERS); setMixMode(false); setDupMode(false); }}>Reset filters</button>
                    </p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
