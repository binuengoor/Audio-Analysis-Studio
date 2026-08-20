import React, { useState } from 'react';
import { QualityResult } from '../types';
import { buildBackendUrl } from '../config';

interface QualityAnalysisProps {
  quality: QualityResult;
}

export const QualityAnalysis: React.FC<QualityAnalysisProps> = ({ quality }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullSpectrogram, setShowFullSpectrogram] = useState(false);

  const { container, mastering, authenticity, spectrogram_image_path } = quality;

  // Extract filename from spectrogram path to build static backend URL
  const specFilename = spectrogram_image_path ? spectrogram_image_path.split('/').pop() : null;
  const specUrl = specFilename ? buildBackendUrl(`/files/input/${encodeURIComponent(specFilename)}`) : null;

  const isLosslessContainer = ['WAV', 'FLAC', 'AIFF', 'ALAC'].includes(container.codec.toUpperCase());
  const isLosslessCutoff = authenticity.cutoff_hz >= 20000;
  const isSuspicious = authenticity.verdict.toUpperCase().includes('SUSPICIOUS') || 
                      authenticity.verdict.toUpperCase().includes('FAKE') ||
                      authenticity.verdict.toUpperCase().includes('TRANSCODE');

  // Verdict Badge Helper
  const getVerdictBadge = () => {
    if (isSuspicious) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 shadow-sm shadow-rose-500/10">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
          ⚠️ {authenticity.verdict}
        </span>
      );
    }
    if (isLosslessContainer && isLosslessCutoff) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          ✓ Genuine Lossless (Full Spectrum)
        </span>
      );
    }
    if (isLosslessContainer && authenticity.cutoff_hz >= 18500) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1.5 shadow-sm shadow-sky-500/10">
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          ✓ Near Lossless (~20 kHz Filtered)
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 shadow-sm shadow-blue-500/10">
        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
        ✓ {authenticity.verdict || `Authentic ${container.codec}`}
      </span>
    );
  };

  // Dynamic Loudness Helper
  const getLoudnessEvaluation = (lufs: number) => {
    if (lufs >= -8.0) {
      return {
        color: 'text-rose-400',
        bg: 'bg-rose-950/40 border-rose-500/30',
        badge: 'Hyper-compressed',
        desc: 'High distortion risk (Heavy Limiting)',
        meterColor: 'bg-rose-500',
        percent: 98,
      };
    }
    if (lufs >= -11.0) {
      const reduction = (Math.abs(lufs) - 14).toFixed(1);
      return {
        color: 'text-amber-400',
        bg: 'bg-amber-950/40 border-amber-500/30',
        badge: 'Very Loud / Club Master',
        desc: `Will be attenuated by ~${reduction} dB on Spotify/Apple`,
        meterColor: 'bg-amber-500',
        percent: 85,
      };
    }
    if (lufs >= -13.0) {
      return {
        color: 'text-yellow-300',
        bg: 'bg-yellow-950/40 border-yellow-500/30',
        badge: 'Commercial Pop Master',
        desc: 'Loud master (-14 LUFS is optimal streaming target)',
        meterColor: 'bg-yellow-400',
        percent: 75,
      };
    }
    if (lufs >= -16.0) {
      return {
        color: 'text-emerald-300',
        bg: 'bg-emerald-950/40 border-emerald-500/30',
        badge: 'Optimal Streaming Target',
        desc: 'Compliant with Spotify/Apple Music -14 LUFS target',
        meterColor: 'bg-emerald-400',
        percent: 65,
      };
    }
    if (lufs >= -23.0) {
      return {
        color: 'text-sky-300',
        bg: 'bg-sky-950/40 border-sky-500/30',
        badge: 'Dynamic / Acoustic Master',
        desc: 'High dynamic range preservation',
        meterColor: 'bg-sky-400',
        percent: 50,
      };
    }
    return {
      color: 'text-slate-400',
      bg: 'bg-slate-900 border-slate-800',
      badge: 'Quiet / Classical Target',
      desc: 'Below streaming targets (EBU R128 -23 LUFS)',
      meterColor: 'bg-slate-500',
      percent: 30,
    };
  };

  // Dynamic True Peak Helper
  const getPeakEvaluation = (peakDb: number) => {
    if (peakDb > 0.0) {
      return {
        color: 'text-rose-400',
        bg: 'bg-rose-950/40 border-rose-500/30',
        badge: 'Clipping (> 0 dBFS)',
        desc: 'Digital overshoot detected (Distortion risk)',
      };
    }
    if (peakDb >= -0.2) {
      return {
        color: 'text-amber-400',
        bg: 'bg-amber-950/40 border-amber-500/30',
        badge: 'Hot Peak (≥ -0.2 dB)',
        desc: 'Risk of inter-sample clipping on lossy transcode',
      };
    }
    if (peakDb >= -1.5) {
      return {
        color: 'text-emerald-300',
        bg: 'bg-emerald-950/40 border-emerald-500/30',
        badge: 'Ideal Ceiling Target',
        desc: 'Meets -1.0 dB true peak streaming recommendation',
      };
    }
    if (peakDb >= -3.0) {
      return {
        color: 'text-sky-300',
        bg: 'bg-sky-950/40 border-sky-500/30',
        badge: 'Safe Headroom',
        desc: 'Clean transient preservation with no clipping',
      };
    }
    return {
      color: 'text-slate-400',
      bg: 'bg-slate-900 border-slate-800',
      badge: 'High Headroom (> 3 dB)',
      desc: 'Ample dynamic margin below digital ceiling',
    };
  };

  const lufsEval = getLoudnessEvaluation(mastering.lufs);
  const peakEval = getPeakEvaluation(mastering.peak_db);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header with Collapsible Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="p-2 bg-emerald-500/15 rounded-lg border border-emerald-500/30 text-emerald-300 group-hover:border-emerald-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider group-hover:text-emerald-300 transition-colors">
                Audio Quality & Mastering Specs
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
              WhatsMyBitrate Engine • Container Properties, Integrated LUFS & True Peak
            </p>
          </div>
        </button>

        <div>{getVerdictBadge()}</div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* Grid of Key Specs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            
            {/* 1. Format & Container Properties */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  Container Format
                </div>
                <div className="text-lg font-extrabold text-white mt-1 flex items-baseline gap-2">
                  <span>{container.codec}</span>
                  <span className="text-xs text-purple-300 font-semibold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                    {container.bit_depth}-bit
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/80">
                {(container.sample_rate_hz / 1000).toFixed(1)} kHz • {container.channels === 2 ? 'Stereo (2ch)' : 'Mono (1ch)'}
              </div>
            </div>

            {/* 2. Stated vs Estimated Perceptual Bitrate */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  Bitrate (Stated / Estimated)
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="text-base font-extrabold text-white">
                    {container.stated_bitrate_kbps} <span className="text-xs font-normal text-slate-400">kbps</span>
                  </div>
                  <span className="text-slate-600 font-bold">/</span>
                  <div className={`px-2 py-0.5 rounded text-xs font-extrabold border ${
                    authenticity.estimated_bitrate_kbps === 'Lossless'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : authenticity.estimated_bitrate_kbps === '320'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : isSuspicious
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {authenticity.estimated_bitrate_kbps} {authenticity.estimated_bitrate_kbps !== 'Lossless' && 'kbps'}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-300 mt-2.5 pt-2 border-t border-slate-800/80 flex justify-between items-center">
                <span>Cutoff:</span>
                <span className="font-mono font-bold text-slate-200">{authenticity.cutoff_hz.toLocaleString()} Hz</span>
              </div>
            </div>

            {/* 3. Integrated Loudness (LUFS) with Reaction & Benchmarks */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Integrated Loudness
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Target: -14 LUFS</span>
                </div>
                <div className={`text-2xl font-extrabold mt-1 ${lufsEval.color}`}>
                  {mastering.lufs.toFixed(1)} <span className="text-xs text-slate-400 font-normal">LUFS</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                <div className={`text-[11px] font-semibold ${lufsEval.color}`}>
                  {lufsEval.badge}
                </div>
                <div className="text-[10px] text-slate-400 truncate" title={lufsEval.desc}>
                  {lufsEval.desc}
                </div>
              </div>
            </div>

            {/* 4. Sample / True Peak (dBFS) with Reaction & Benchmarks */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Sample Peak Level
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Ceiling: -1.0 dB</span>
                </div>
                <div className={`text-2xl font-extrabold mt-1 ${peakEval.color}`}>
                  {mastering.peak_db.toFixed(1)} <span className="text-xs text-slate-400 font-normal">dBFS</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                <div className={`text-[11px] font-semibold ${peakEval.color}`}>
                  {peakEval.badge}
                </div>
                <div className="text-[10px] text-slate-400 truncate" title={peakEval.desc}>
                  {peakEval.desc}
                </div>
              </div>
            </div>

          </div>

          {/* Spectrogram Image Viewer */}
          {specUrl && (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Linear Frequency Spectrogram
                </span>
                <button
                  onClick={() => setShowFullSpectrogram(!showFullSpectrogram)}
                  className="text-purple-300 hover:text-purple-100 font-medium transition-colors text-[11px] flex items-center gap-1"
                >
                  {showFullSpectrogram ? 'Collapse' : 'Expand / Full Size'}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showFullSpectrogram ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                  </svg>
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] flex justify-center items-center shadow-inner">
                <img
                  src={specUrl}
                  alt="Spectrogram"
                  className={`w-full object-contain transition-all duration-300 cursor-pointer ${
                    showFullSpectrogram ? 'max-h-[500px]' : 'max-h-[220px]'
                  }`}
                  onClick={() => setShowFullSpectrogram(!showFullSpectrogram)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
