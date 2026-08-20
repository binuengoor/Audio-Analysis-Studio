import React, { useState, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/useAudioStore';

export const UploadZone: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const { addAudioFiles, processing, progress } = useAudioStore();
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
        /\.(mp3|wav|flac|m4a|aac|ogg|aiff)$/i.test(file.name)
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

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative overflow-hidden
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

      <div className="flex flex-col items-center justify-center space-y-3">
        <div className="p-3.5 bg-gradient-to-tr from-purple-600 to-sky-500 rounded-2xl text-white shadow-lg shadow-purple-500/20">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <div>
          <p className="text-base font-bold text-white">
            Drop audio tracks here or click to browse
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supports batch drops • MP3, WAV, FLAC, M4A, OGG, AIFF
          </p>
        </div>

        {processing && (
          <div className="w-full max-w-xs mt-2 space-y-1.5">
            <div className="flex justify-between text-xs text-purple-300 font-medium">
              <span>Processing Queue...</span>
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
  );
};
