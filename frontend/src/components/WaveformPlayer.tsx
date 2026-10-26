import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { SectionSegment } from '../types';

export interface WaveformPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
}

interface WaveformPlayerProps {
  audioUrl: string;
  segments?: SectionSegment[];
  startTime?: number;
  endTime?: number;
  seekToTimestamp?: number;
  onTimeUpdate?: (seconds: number) => void;
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(({
  audioUrl,
  segments = [],
  startTime,
  endTime,
  seekToTimestamp,
  onTimeUpdate,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regionsPlugin = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
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
    togglePlay: () => {
      if (isReady) wavesurfer.current?.playPause();
    },
    seekBy: (delta: number) => {
      const ws = wavesurfer.current;
      if (!ws || !isReady) return;
      ws.setTime(Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + delta)));
    },
  }));

  useEffect(() => {
    if (seekToTimestamp !== undefined && wavesurfer.current && isReady) {
      wavesurfer.current.setTime(seekToTimestamp);
    }
  }, [seekToTimestamp, isReady]);

  // Handle waveform instantiation
  useEffect(() => {
    if (!containerRef.current) return;

    setIsReady(false);
    setIsPlaying(false);

    // Initialize WaveSurfer
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#475569', // slate-600
      progressColor: '#a855f7', // purple-500
      cursorColor: '#38bdf8', // sky-400
      barWidth: 2,
      barGap: 1,
      height: 96,
      url: audioUrl,
    });

    const wsRegions = ws.registerPlugin(RegionsPlugin.create());
    regionsPlugin.current = wsRegions;

    ws.on('ready', () => {
      setIsReady(true);
      const dur = ws.getDuration();
      setTotalDuration(dur);
    });

    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    });

    // Auto-play when user clicks on waveform to seek
    ws.on('click', () => {
      ws.play();
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
  }, [audioUrl]);

  // Handle updating regions whenever segments or isReady change
  useEffect(() => {
    if (!regionsPlugin.current || !isReady) return;

    const wsRegions = regionsPlugin.current;
    wsRegions.clearRegions();

    if (segments && segments.length > 0) {
      segments.forEach((seg) => {
        const region = wsRegions.addRegion({
          start: seg.start,
          end: seg.end,
          content: seg.label,
          color: seg.color || 'rgba(99, 102, 241, 0.20)',
          drag: false,
          resize: false,
        });

        // Set pointer-events: none on region overlay so clicks pass directly to waveform for exact timestamp seeking
        if (region.element) {
          region.element.style.pointerEvents = 'none';
          region.element.style.borderRadius = '4px';
          region.element.style.border = '1px solid rgba(255, 255, 255, 0.12)';
          region.element.style.fontSize = '11px';
          region.element.style.fontWeight = '700';
          region.element.style.color = '#f1f5f9';
          region.element.style.padding = '4px 8px';
        }
      });
    } else if (startTime !== undefined && endTime !== undefined) {
      wsRegions.addRegion({
        start: startTime,
        end: endTime,
        color: 'rgba(34, 197, 94, 0.15)',
        drag: false,
        resize: false,
      });
    }
  }, [segments, isReady, startTime, endTime]);

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
    <div className="w-full bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
      {/* Waveform Canvas */}
      <div ref={containerRef} className="w-full" />

      {/* Player Controls Bar */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-900">
        <div className="text-xs font-mono text-slate-400">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>

        <button
          onClick={togglePlayPause}
          disabled={!isReady}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={`
            px-6 py-2 rounded-full font-bold transition-all flex items-center gap-2 text-sm shadow-lg
            ${isReady 
              ? 'bg-gradient-to-r from-purple-600 to-sky-500 text-white hover:from-purple-500 hover:to-sky-400 shadow-purple-500/20' 
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
