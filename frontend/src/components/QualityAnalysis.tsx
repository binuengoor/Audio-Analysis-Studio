import React, { useState } from 'react';
import { QualityResult } from '../types';
import { buildBackendUrl } from '../config';

interface QualityAnalysisProps {
  quality: QualityResult;
}

export const QualityAnalysis: React.FC<QualityAnalysisProps> = ({ quality }) => {
  const [showFullSpectrogram, setShowFullSpectrogram] = useState(false);

  const { container, mastering, authenticity, spectrogram_image_path } = quality;

  // Extract filename from spectrogram path to build static backend URL
  const specFilename = spectrogram_image_path ? spectrogram_image_path.split('/').pop() : null;
  const specUrl = specFilename ? buildBackendUrl(`/files/input/${encodeURIComponent(specFilename)}`) : null;

  const isLossless = authenticity.cutoff_hz > 20000;
  const isSuspicious = authenticity.verdict === 'SUSPICIOUS' || authenticity.verdict === 'FAKE';

  const getVerdictBadge = () => {
    if (isSuspicious) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 shadow-sm shadow-rose-500/10">
          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
          {authenticity.verdict} (Possible Transcode)
        </span>
      );
    }
    if (isLossless) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          Genuine Lossless
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1.5 shadow-sm shadow-sky-500/10">
        <span className="w-2 h-2 rounded-full bg-sky-400"></span>
        {authenticity.verdict}
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-500/15 rounded-lg border border-emerald-500/30 text-emerald-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Audio Quality & Mastering Specs
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              WhatsMyBitrate Engine • Container Properties, LUFS & True Peak
            </p>
          </div>
        </div>

        <div>{getVerdictBadge()}</div>
      </div>

      {/* Grid of Key Specs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Container Specs */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Format & Bit Depth</div>
          <div className="text-base font-bold text-white mt-1">
            {container.codec} <span className="text-xs text-slate-300 font-normal">{container.bit_depth}-bit</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {(container.sample_rate_hz / 1000).toFixed(1)} kHz • {container.channels === 2 ? 'Stereo' : 'Mono'}
          </div>
        </div>

        {/* Bitrate */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Bitrate (Stated / Perceptual)</div>
          <div className="text-base font-bold text-emerald-300 mt-1">
            {container.stated_bitrate_kbps} <span className="text-xs text-slate-400 font-normal">kbps</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Est: <span className="font-semibold text-slate-200">{authenticity.estimated_bitrate_kbps} kbps</span>
          </div>
        </div>

        {/* Mastering LUFS */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Integrated Loudness</div>
          <div className="text-base font-bold text-purple-300 mt-1">
            {mastering.lufs.toFixed(1)} <span className="text-xs text-slate-400 font-normal">LUFS</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {mastering.lufs > -14 ? 'Louder than -14 target' : 'Streaming compliant'}
          </div>
        </div>

        {/* Peak dB */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Sample Peak & Cutoff</div>
          <div className="text-base font-bold text-sky-300 mt-1">
            {mastering.peak_db.toFixed(1)} <span className="text-xs text-slate-400 font-normal">dBFS</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
            Cutoff: <span className="font-semibold text-slate-200">{authenticity.cutoff_hz.toLocaleString()} Hz</span>
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
  );
};
