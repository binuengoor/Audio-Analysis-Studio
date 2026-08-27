import React, { useState, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/useAudioStore';

export const UploadZone: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [audioFormat, setAudioFormat] = useState('flac');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const { addAudioFiles, importAudioFromUrl, processing, progress } = useAudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith('audio/') ||
        file.type.startsWith('video/') ||
        /\.(mp3|wav|flac|m4a|aac|ogg|aiff|aif|alac|opus|mp4)$/i.test(file.name)
    );

    if (validFiles.length > 0) {
      addAudioFiles(validFiles);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [addAudioFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClickDropzone = () => {
    fileInputRef.current?.click();
  };

  const handleUrlSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setUrlError(null);
    setUrlLoading(true);

    try {
      await importAudioFromUrl(trimmed, audioFormat);
      setUrlInput('');
    } catch (err: any) {
      setUrlError(err.message || 'Failed to download audio from URL');
    } finally {
      setUrlLoading(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setUrlError(null);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* File Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickDropzone}
        className={`
          border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer relative overflow-hidden
          ${
            isDragging
              ? 'border-purple-400 bg-purple-500/15 scale-[1.01]'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900/90'
          }
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          className="hidden"
          multiple
          accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.aiff"
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-3 bg-gradient-to-tr from-purple-600 to-sky-500 rounded-2xl text-white shadow-lg shadow-purple-500/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <p className="text-sm font-bold text-white">
              Drop audio tracks here or click to browse
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Supports batch drops • MP3, WAV, FLAC, M4A, OGG, AIFF
            </p>
          </div>

          {processing && (
            <div className="w-full max-w-xs mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between text-xs text-purple-300 font-medium">
                <span>Processing & Analyzing...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-sky-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clean Divider */}
      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 border-t border-slate-800" />
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
          or import from URL
        </span>
        <div className="flex-1 border-t border-slate-800" />
      </div>

      {/* URL Intake Box */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          {/* URL Input with embedded Paste button */}
          <div className="relative flex items-center">
            <div className="absolute left-3 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (urlError) setUrlError(null);
              }}
              placeholder="Paste YouTube, SoundCloud, or audio URL..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-16 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
              disabled={urlLoading || processing}
            />
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="absolute right-1.5 px-2.5 py-1 text-[11px] font-semibold text-purple-300 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/40 rounded-lg transition-all"
            >
              Paste
            </button>
          </div>

          {/* Action Row: Format Selector + Submit Button */}
          <div className="flex items-center gap-2">
            <select
              value={audioFormat}
              onChange={(e) => setAudioFormat(e.target.value)}
              disabled={urlLoading || processing}
              className="w-2/5 bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition-colors cursor-pointer truncate"
              title="Target audio format"
            >
              <option value="flac">Auto (FLAC)</option>
              <option value="mp3">MP3 (320k)</option>
              <option value="wav">WAV</option>
              <option value="m4a">M4A (AAC)</option>
            </select>

            <button
              type="submit"
              disabled={!urlInput.trim() || urlLoading || processing}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 to-sky-500 hover:from-purple-500 hover:to-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-2 px-3 rounded-xl shadow-md shadow-purple-500/10 transition-all truncate"
            >
              {urlLoading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download & Analyze</span>
                </>
              )}
            </button>
          </div>

          {/* Error Alert */}
          {urlError && (
            <div className="flex items-start gap-2 bg-red-950/50 border border-red-900/60 rounded-xl p-2.5 text-xs text-red-300">
              <svg className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="leading-snug break-words">{urlError}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
