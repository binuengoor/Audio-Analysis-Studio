import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { SectionSegment } from '../types';

export interface WaveformPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
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
  const regionsPlugin = useRef<any>(null);
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

    // Handle region click for fast section jump
    wsRegions.on('region-clicked', (region: any, e: MouseEvent) => {
      e.stopPropagation();
      ws.setTime(region.start);
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

        // Add custom clean style to region DOM element
        if (region.element) {
          region.element.style.borderRadius = '6px';
          region.element.style.border = '1px solid rgba(255, 255, 255, 0.12)';
          region.element.style.fontSize = '11px';
          region.element.style.fontWeight = '700';
          region.element.style.color = '#f1f5f9';
          region.element.style.padding = '4px 8px';
          region.element.style.cursor = 'pointer';
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

  const handleSectionClick = (start: number) => {
    if (wavesurfer.current && isReady) {
      wavesurfer.current.setTime(start);
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

      {/* Structural Segmentation Pill Ribbon */}
      {segments && segments.length > 0 && (
        <div className="pt-2 border-t border-slate-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pink-400"></span>
              Song Structure / Sections ({segments.length})
            </span>
            <span className="text-[10px] text-slate-500">Click section to seek</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {segments.map((seg, idx) => {
              const isActive = currentTime >= seg.start && currentTime <= seg.end;
              return (
                <button
                  key={idx}
                  onClick={() => handleSectionClick(seg.start)}
                  style={{
                    backgroundColor: isActive ? seg.color.replace('0.20', '0.45').replace('0.25', '0.50') : seg.color,
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-2 ${
                    isActive
                      ? 'border-white/40 text-white ring-2 ring-purple-500/50 shadow-md shadow-purple-500/20 scale-105'
                      : 'border-white/10 text-slate-300 hover:text-white hover:border-white/30'
                  }`}
                >
                  <span>{seg.label}</span>
                  <span className="text-[10px] font-mono text-slate-400 font-normal">
                    {formatTime(seg.start)} - {formatTime(seg.end)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Player Controls Bar */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-900">
        <div className="text-xs font-mono text-slate-400">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>

        <button
          onClick={togglePlayPause}
          disabled={!isReady}
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
