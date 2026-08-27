import React, { useState, useRef } from 'react';
import { buildBackendUrl } from '../config';
import { useAudioStore } from '../store/useAudioStore';

interface PitchTimeStretchProps {
  filename?: string;
  detectedBpm?: number;
  detectedKeyStandard?: string;
  detectedKeyCamelot?: string;
}

// Chromatic notes and key calculation utilities
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['8A', '3A', '10A', '5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A'];

function transposeKey(keyStandard?: string, semitones: number = 0): { key: string; camelot: string } | null {
  if (!keyStandard || semitones === 0) return null;

  const isMinor = keyStandard.toLowerCase().includes('minor') || keyStandard.endsWith('m');
  const cleanNote = keyStandard
    .replace(/minor/i, '')
    .replace(/major/i, '')
    .replace('m', '')
    .trim();

  const flatMap: Record<string, string> = {
    Db: 'C#',
    Eb: 'D#',
    Gb: 'F#',
    Ab: 'G#',
    Bb: 'A#',
  };
  const normalizedNote = flatMap[cleanNote] || cleanNote;
  const idx = NOTES_SHARP.indexOf(normalizedNote);
  if (idx === -1) return null;

  const newIdx = (idx + semitones + 120) % 12;
  const newNote = NOTES_SHARP[newIdx];
  const newKeyStandard = `${newNote} ${isMinor ? 'minor' : 'major'}`;

  let camelot = '';
  if (isMinor) {
    const minorOffset = (newIdx - 9 + 12) % 12;
    camelot = CAMELOT_MINOR[minorOffset];
  } else {
    camelot = CAMELOT_MAJOR[newIdx];
  }

  return { key: newKeyStandard, camelot };
}

export const PitchTimeStretch: React.FC<PitchTimeStretchProps> = ({
  filename,
  detectedBpm = 120,
  detectedKeyStandard,
  detectedKeyCamelot,
}) => {
  // Collapsed by default
  const [isExpanded, setIsExpanded] = useState(false);

  // Transformation states
  const [pitchSemitones, setPitchSemitones] = useState<number>(0);
  const [tempoRatio, setTempoRatio] = useState<number>(1.0);
  const [targetBpmInput, setTargetBpmInput] = useState<string>(detectedBpm ? String(detectedBpm) : '120');
  const [preserveFormants, setPreserveFormants] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<string>('wav');

  // Output filename pattern & tag helper
  const [renamePattern, setRenamePattern] = useState<string>('{OriginalName} - {Key} - {BPM}');
  const [showTagHelp, setShowTagHelp] = useState<boolean>(false);

  // Processing & Audio Player states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const [resultDuration, setResultDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { fetchLibrary } = useAudioStore();

  const shiftedKey = transposeKey(detectedKeyStandard, pitchSemitones);
  const currentTargetBpm = detectedBpm ? Math.round(detectedBpm * tempoRatio * 10) / 10 : 0;

  // Handle tempo slider change
  const handleTempoSliderChange = (ratio: number) => {
    setTempoRatio(ratio);
    if (detectedBpm) {
      setTargetBpmInput(String(Math.round(detectedBpm * ratio)));
    }
  };

  // Handle direct target BPM change
  const handleTargetBpmChange = (bpmStr: string) => {
    setTargetBpmInput(bpmStr);
    const parsed = parseFloat(bpmStr);
    if (parsed && detectedBpm && detectedBpm > 0) {
      const newRatio = Math.max(0.5, Math.min(2.0, Math.round((parsed / detectedBpm) * 1000) / 1000));
      setTempoRatio(newRatio);
    }
  };

  // Compute live output filename from pattern
  const origBase = filename ? filename.replace(/\.[^/.]+$/, '') : 'track';
  const effKey = shiftedKey ? shiftedKey.key : (detectedKeyStandard || 'C major');
  const effCamelot = shiftedKey ? shiftedKey.camelot : (detectedKeyCamelot || '8B');
  const effBpm = currentTargetBpm || detectedBpm || 120;
  const pitchTag = pitchSemitones >= 0 ? `+${pitchSemitones}st` : `${pitchSemitones}st`;
  const tempoTag = `${tempoRatio.toFixed(2)}x`;

  let computedFilename = renamePattern
    .replace(/\{OriginalName\}/g, origBase)
    .replace(/\{Key\}/g, effKey)
    .replace(/\{Camelot\}/g, effCamelot)
    .replace(/\{BPM\}/g, String(Math.round(effBpm)))
    .replace(/\{Pitch\}/g, pitchTag)
    .replace(/\{PitchShift\}/g, pitchTag)
    .replace(/\{Tempo\}/g, tempoTag)
    .replace(/\{Speed\}/g, tempoTag);

  if (!computedFilename.toLowerCase().endsWith(`.${outputFormat}`)) {
    computedFilename = `${computedFilename}.${outputFormat}`;
  }

  // Trigger transformation microservice call
  const handleProcessStretch = async () => {
    if (!filename) return;

    setIsProcessing(true);
    try {
      const resp = await fetch(buildBackendUrl('/api/stretch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          pitch_semitones: pitchSemitones,
          tempo_ratio: tempoRatio,
          target_bpm: currentTargetBpm || undefined,
          original_bpm: detectedBpm || undefined,
          preserve_formants: preserveFormants,
          output_format: outputFormat,
          output_filename: computedFilename,
          add_to_library: true,
        }),
      });

      if (!resp.ok) {
        let errDetail = 'Pitch shifting & time stretching failed';
        try {
          const errData = await resp.json();
          errDetail = errData.detail || errDetail;
        } catch {}
        throw new Error(errDetail);
      }

      const data = await resp.json();
      const outputUrl = buildBackendUrl(data.output_url);
      setResultAudioUrl(outputUrl);
      setResultFilename(data.output_filename);
      setResultDuration(data.duration);
      setIsPlaying(false);
      setCurrentTime(0);

      // Refresh library database
      await fetchLibrary();
    } catch (err: any) {
      console.error('Stretch processing failed:', err);
      alert(`Transformation failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Audio player helpers
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setPlayerDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatSecs = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header with Collapsible Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="p-2 bg-purple-500/15 rounded-lg border border-purple-500/30 text-purple-300 group-hover:border-purple-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider group-hover:text-purple-300 transition-colors">
                Pitch Shifting & Time Stretching
              </h3>
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
              Rubber Band Library v4.0 Engine
            </p>
          </div>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-5 pt-1">
          {/* Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Left Card: Pitch Shifting */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  Pitch Transposition
                </span>
                <span className="text-sm font-mono font-extrabold text-blue-300 bg-blue-950/60 border border-blue-500/30 px-2.5 py-0.5 rounded-lg">
                  {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitones
                </span>
              </div>

              {/* Pitch Slider */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={pitchSemitones}
                  onChange={(e) => setPitchSemitones(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>-12 st (-1 Octave)</span>
                  <span>0 (Original)</span>
                  <span>+12 st (+1 Octave)</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                {[-3, -2, -1, 0, 1, 2, 3].map((st) => (
                  <button
                    key={st}
                    onClick={() => setPitchSemitones(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      pitchSemitones === st
                        ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {st === 0 ? 'Reset (0)' : st > 0 ? `+${st} st` : `${st} st`}
                  </button>
                ))}
              </div>

              {/* Transposed Key Feedback */}
              <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
                <span className="text-slate-400">Estimated Shifted Key:</span>
                {shiftedKey ? (
                  <span className="font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                    {shiftedKey.key} ({shiftedKey.camelot})
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium font-mono">
                    {detectedKeyStandard ? `${detectedKeyStandard} (${detectedKeyCamelot || ''})` : 'Original Key'}
                  </span>
                )}
              </div>
            </div>

            {/* Right Card: Time Stretching & Tempo */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  Tempo / Time Stretch
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-extrabold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-lg">
                    {tempoRatio.toFixed(2)}x ({Math.round(tempoRatio * 100)}%)
                  </span>
                </div>
              </div>

              {/* Tempo Slider */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={tempoRatio}
                  onChange={(e) => handleTempoSliderChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.50x (50% Slower)</span>
                  <span>1.00x (Original)</span>
                  <span>2.00x (200% Faster)</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                {[0.75, 0.85, 0.9, 1.0, 1.1, 1.25, 1.5].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleTempoSliderChange(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      tempoRatio === r
                        ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {r === 1.0 ? '1.0x (100%)' : `${r}x`}
                  </button>
                ))}
              </div>

              {/* Target BPM & Original BPM */}
              <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
                <span className="text-slate-400">Target Tempo:</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="1"
                      value={targetBpmInput}
                      onChange={(e) => handleTargetBpmChange(e.target.value)}
                      className="w-12 bg-transparent text-amber-300 font-mono font-bold text-xs focus:outline-none text-right"
                    />
                    <span className="text-[10px] text-slate-400">BPM</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    (Orig: {detectedBpm || 120})
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Minimized Output Filename Pattern Block */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 space-y-3">
            <div className="flex justify-between items-center relative">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Download Filename Pattern
              </span>

              {/* Tag Tooltip Button */}
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
                  <div className="absolute right-0 bottom-7 w-72 bg-slate-950 border border-purple-500/40 rounded-xl p-3 shadow-2xl z-50 text-xs space-y-2 backdrop-blur-md">
                    <div className="font-bold text-purple-300 border-b border-slate-800 pb-1">
                      Available Filename Tokens:
                    </div>
                    <ul className="space-y-1.5 text-slate-300 text-[11px]">
                      <li>
                        <code className="text-emerald-300 font-mono font-semibold">{`{OriginalName}`}</code>
                        <p className="text-slate-400 text-[10px]">Original track name</p>
                      </li>
                      <li>
                        <code className="text-blue-300 font-mono font-semibold">{`{Key}`}</code>
                        <p className="text-slate-400 text-[10px]">Shifted Key (e.g. {effKey})</p>
                      </li>
                      <li>
                        <code className="text-purple-300 font-mono font-semibold">{`{Camelot}`}</code>
                        <p className="text-slate-400 text-[10px]">Shifted Camelot (e.g. {effCamelot})</p>
                      </li>
                      <li>
                        <code className="text-amber-300 font-mono font-semibold">{`{BPM}`}</code>
                        <p className="text-slate-400 text-[10px]">Shifted Tempo (e.g. {Math.round(effBpm)})</p>
                      </li>
                      <li>
                        <code className="text-pink-300 font-mono font-semibold">{`{Pitch}`}</code>
                        <p className="text-slate-400 text-[10px]">Pitch shift tag (e.g. {pitchTag})</p>
                      </li>
                      <li>
                        <code className="text-sky-300 font-mono font-semibold">{`{Tempo}`}</code>
                        <p className="text-slate-400 text-[10px]">Speed ratio tag (e.g. {tempoTag})</p>
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
                onChange={(e) => setRenamePattern(e.target.value)}
                className="w-full border border-slate-700 rounded-xl px-3.5 py-1.5 text-xs bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                placeholder="{OriginalName} - {Key} - {BPM}"
              />

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-semibold mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setRenamePattern('{OriginalName} - {Key} - {BPM}')}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    renamePattern === '{OriginalName} - {Key} - {BPM}'
                      ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {`{OriginalName} - {Key} - {BPM}`}
                </button>
                <button
                  type="button"
                  onClick={() => setRenamePattern('{OriginalName} - {Pitch} - {Tempo}')}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    renamePattern === '{OriginalName} - {Pitch} - {Tempo}'
                      ? 'bg-purple-600/30 text-purple-200 border-purple-500/50 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {`{OriginalName} - {Pitch} - {Tempo}`}
                </button>
                <button
                  type="button"
                  onClick={() => setRenamePattern('{Camelot} - {BPM} - {OriginalName}')}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
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
                <span className="text-slate-500 font-semibold">Preview:</span>
                <span className="font-mono text-emerald-300 font-bold truncate">
                  {computedFilename}
                </span>
              </div>
            </div>
          </div>

          {/* Options Row & Action Button */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            
            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
              {/* Formant Preservation Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preserveFormants}
                  onChange={(e) => setPreserveFormants(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-900 w-4 h-4"
                />
                <span className="font-semibold text-slate-200">Preserve Vocal Formants</span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">(Prevents chipmunk timbre)</span>
              </label>

              {/* Output Format Picker */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Format:</span>
                <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  {['wav', 'flac', 'mp3'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOutputFormat(f)}
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
              onClick={handleProcessStretch}
              disabled={isProcessing || !filename}
              className={`px-6 py-2.5 rounded-xl font-extrabold text-sm shadow-lg transition-all flex items-center gap-2 ${
                isProcessing
                  ? 'bg-purple-800 text-purple-300 cursor-wait'
                  : 'bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 text-white shadow-purple-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
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

          {/* Transformed Result Preview Player */}
          {resultAudioUrl && (
            <div className="bg-gradient-to-r from-purple-950/40 via-slate-950 to-sky-950/40 p-4 rounded-xl border border-purple-500/40 space-y-3 shadow-inner">
              <audio
                ref={audioRef}
                src={resultAudioUrl}
                onTimeUpdate={handleAudioTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Transformed Audio Ready
                  </span>
                  <div className="text-xs font-bold text-white mt-0.5 truncate max-w-md">
                    {resultFilename || computedFilename}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={resultAudioUrl}
                    download={resultFilename || computedFilename}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Track
                  </a>
                </div>
              </div>

              {/* Playback Controls & Progress Bar */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={togglePlayPause}
                  className="p-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 transition-transform active:scale-95"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={playerDuration || resultDuration || 100}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>{formatSecs(currentTime)}</span>
                    <span>{formatSecs(playerDuration || resultDuration || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
