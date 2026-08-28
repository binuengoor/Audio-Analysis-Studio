import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseAudioPreviewReturn {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  togglePlayPause: () => void;
  seek: (seconds: number) => void;
  handleTimeUpdate: () => void;
  handleEnded: () => void;
  formatSecs: (secs: number) => string;
  reset: () => void;
}

export const formatAudioDuration = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function useAudioPreview(audioUrl: string | null): UseAudioPreviewReturn {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Reset playback when audio URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [audioUrl]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => {
        console.error('Audio preview play error:', e);
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const formatSecs = useCallback((secs: number): string => {
    return formatAudioDuration(secs);
  }, []);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    togglePlayPause,
    seek,
    handleTimeUpdate,
    handleEnded,
    formatSecs,
    reset,
  };
}
