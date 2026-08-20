import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

export interface WaveformPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

interface WaveformPlayerProps {
  audioUrl: string;
  startTime?: number;
  endTime?: number;
  seekToTimestamp?: number;
  onTimeUpdate?: (seconds: number) => void;
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(({
  audioUrl,
  startTime,
  endTime,
  seekToTimestamp,
  onTimeUpdate,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (wavesurfer.current && isReady && totalDuration > 0) {
        wavesurfer.current.setTime(seconds);
      }
    },
    play: () => {
      wavesurfer.current?.play();
    },
    pause: () => {
      wavesurfer.current?.pause();
    },
  }));

  useEffect(() => {
    if (seekToTimestamp !== undefined && wavesurfer.current && isReady) {
      wavesurfer.current.setTime(seekToTimestamp);
    }
  }, [seekToTimestamp, isReady]);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsReady(false);
    setIsPlaying(false);

    // Initialize WaveSurfer
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#64748b', // slate-500
      progressColor: '#a855f7', // purple-500
      cursorColor: '#38bdf8', // sky-400
      barWidth: 2,
      barGap: 1,
      height: 90,
      url: audioUrl,
    });

    const wsRegions = ws.registerPlugin(RegionsPlugin.create());

    ws.on('ready', () => {
      setIsReady(true);
      const dur = ws.getDuration();
      setTotalDuration(dur);

      if (startTime !== undefined && endTime !== undefined) {
        wsRegions.addRegion({
          start: startTime,
          end: endTime,
          color: 'rgba(34, 197, 94, 0.15)',
          drag: false,
          resize: false,
        });
      }
    });

    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    wavesurfer.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl, startTime, endTime]);

  const togglePlayPause = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-sm space-y-3">
      <div ref={containerRef} className="w-full" />
      
      <div className="flex items-center justify-between pt-1">
        <div className="text-xs font-mono text-slate-400">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>

        <button
          onClick={togglePlayPause}
          disabled={!isReady}
          className={`
            px-6 py-2 rounded-full font-semibold transition-all flex items-center gap-2 text-sm
            ${isReady 
              ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-600/20' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
          `}
        >
          {isPlaying ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 9v6m4-6v6" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              Play
            </>
          )}
        </button>

        {startTime !== undefined && endTime !== undefined ? (
          <div className="text-xs text-slate-400">
            Active: {startTime.toFixed(1)}s - {endTime.toFixed(1)}s
          </div>
        ) : (
          <div className="text-xs text-slate-500">Preview Mode</div>
        )}
      </div>
    </div>
  );
});
