import React, { useState } from 'react';
import { buildBackendUrl } from '../config';
import { useAudioStore } from '../store/useAudioStore';
import { transposeKey } from '../utils/musicTheory';
import { useAudioPreview } from '../hooks/useAudioPreview';

import { PitchTranspositionCard } from './pitch-stretch/PitchTranspositionCard';
import { TempoStretchCard } from './pitch-stretch/TempoStretchCard';
import { FilenamePatternBuilder } from './pitch-stretch/FilenamePatternBuilder';
import { StretchOptionsBar } from './pitch-stretch/StretchOptionsBar';
import { TransformedAudioPlayer } from './pitch-stretch/TransformedAudioPlayer';

interface PitchTimeStretchProps {
  filename?: string;
  detectedBpm?: number;
  detectedKeyStandard?: string;
  detectedKeyCamelot?: string;
}

export const PitchTimeStretch: React.FC<PitchTimeStretchProps> = ({
  filename,
  detectedBpm = 120,
  detectedKeyStandard,
  detectedKeyCamelot,
}) => {
  // Collapsible accordion state
  const [isExpanded, setIsExpanded] = useState(false);

  // Transformation states
  const [pitchSemitones, setPitchSemitones] = useState<number>(0);
  const [tempoRatio, setTempoRatio] = useState<number>(1.0);
  const [targetBpmInput, setTargetBpmInput] = useState<string>(
    detectedBpm ? String(detectedBpm) : '120'
  );
  const [preserveFormants, setPreserveFormants] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<string>('wav');

  // Filename pattern states
  const [renamePattern, setRenamePattern] = useState<string>(
    '{OriginalName} - {Key} - {BPM}'
  );
  const [showTagHelp, setShowTagHelp] = useState<boolean>(false);

  // Processing & result states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const [resultDuration, setResultDuration] = useState<number | null>(null);

  // Custom audio playback hook
  const audioPreview = useAudioPreview(resultAudioUrl);
  const { fetchLibrary, showToast } = useAudioStore();

  const shiftedKey = detectedKeyStandard
    ? transposeKey(detectedKeyStandard, pitchSemitones)
    : null;
  const currentTargetBpm = detectedBpm
    ? Math.round(detectedBpm * tempoRatio * 10) / 10
    : 0;

  const handleTempoSliderChange = (ratio: number) => {
    setTempoRatio(ratio);
    if (detectedBpm) {
      setTargetBpmInput(String(Math.round(detectedBpm * ratio)));
    }
  };

  const handleTargetBpmChange = (bpmStr: string) => {
    setTargetBpmInput(bpmStr);
    const parsed = parseFloat(bpmStr);
    if (parsed && detectedBpm && detectedBpm > 0) {
      const newRatio = Math.max(
        0.5,
        Math.min(2.0, Math.round((parsed / detectedBpm) * 1000) / 1000)
      );
      setTempoRatio(newRatio);
    }
  };

  // Compute live output filename from pattern
  const origBase = filename ? filename.replace(/\.[^/.]+$/, '') : 'track';
  const effKey = shiftedKey
    ? shiftedKey.standard
    : detectedKeyStandard || 'C major';
  const effCamelot = shiftedKey
    ? shiftedKey.camelot
    : detectedKeyCamelot || '8B';
  const effBpm = currentTargetBpm || detectedBpm || 120;
  const pitchTag =
    pitchSemitones >= 0 ? `+${pitchSemitones}st` : `${pitchSemitones}st`;
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

      // Refresh library database & notify user
      await fetchLibrary();
      showToast(
        `Rubber Band processing complete: ${data.output_filename}`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Stretch processing failed:', msg);
      showToast(`Transformation failed: ${msg}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header with Collapsible Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="p-2 bg-purple-500/15 rounded-lg border border-purple-500/30 text-purple-300 group-hover:border-purple-400 transition-colors">
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
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
            <PitchTranspositionCard
              pitchSemitones={pitchSemitones}
              onPitchChange={setPitchSemitones}
              shiftedKey={shiftedKey}
              detectedKeyStandard={detectedKeyStandard}
              detectedKeyCamelot={detectedKeyCamelot}
            />

            <TempoStretchCard
              tempoRatio={tempoRatio}
              onTempoRatioChange={handleTempoSliderChange}
              targetBpmInput={targetBpmInput}
              onTargetBpmInputChange={handleTargetBpmChange}
              detectedBpm={detectedBpm}
            />
          </div>

          {/* Output Filename Pattern Builder */}
          <FilenamePatternBuilder
            renamePattern={renamePattern}
            onPatternChange={setRenamePattern}
            showTagHelp={showTagHelp}
            onToggleTagHelp={setShowTagHelp}
            computedFilename={computedFilename}
            effKey={effKey}
            effCamelot={effCamelot}
            effBpm={effBpm}
            pitchTag={pitchTag}
            tempoTag={tempoTag}
          />

          {/* Options Row & Action Button */}
          <StretchOptionsBar
            preserveFormants={preserveFormants}
            onPreserveFormantsChange={setPreserveFormants}
            outputFormat={outputFormat}
            onOutputFormatChange={setOutputFormat}
            isProcessing={isProcessing}
            onProcess={handleProcessStretch}
            disabled={!filename}
          />

          {/* Transformed Result Preview Player */}
          {resultAudioUrl && (
            <TransformedAudioPlayer
              audioRef={audioPreview.audioRef}
              audioUrl={resultAudioUrl}
              filename={resultFilename}
              computedFilename={computedFilename}
              duration={audioPreview.duration || resultDuration || 0}
              currentTime={audioPreview.currentTime}
              isPlaying={audioPreview.isPlaying}
              onTogglePlayPause={audioPreview.togglePlayPause}
              onSeek={audioPreview.seek}
              onTimeUpdate={audioPreview.handleTimeUpdate}
              onEnded={audioPreview.handleEnded}
              formatSecs={audioPreview.formatSecs}
            />
          )}
        </div>
      )}
    </div>
  );
};
