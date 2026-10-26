import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../config';

interface ServiceStatus {
  name: string;
  status: 'ok' | 'error';
  port: number;
  latency_ms: number;
  engine: string;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthy_count: number;
  total_count: number;
  services: ServiceStatus[];
  timestamp: number;
}

export const ServiceHealthBadge: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const resp = await apiFetch('/api/health/services');
      if (resp.ok) {
        const data: HealthResponse = await resp.json();
        setHealth(data);
        setLastChecked(new Date());
      } else {
        setHealth({
          status: 'unhealthy',
          healthy_count: 0,
          total_count: 8,
          services: [],
          timestamp: Date.now() / 1000,
        });
      }
    } catch {
      setHealth({
        status: 'unhealthy',
        healthy_count: 0,
        total_count: 8,
        services: [],
        timestamp: Date.now() / 1000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Poll health every 30 seconds
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const healthyCount = health?.healthy_count ?? 8;
  const totalCount = health?.total_count ?? 8;
  const status = health?.status ?? 'healthy';

  const getStatusBadge = () => {
    if (status === 'healthy') {
      return (
        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full font-medium flex items-center gap-2 whitespace-nowrap shadow-sm hover:border-emerald-400 transition-all cursor-pointer select-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Microservices Live</span>
          <span className="text-[10px] bg-emerald-950/80 px-1.5 py-0.2 rounded text-emerald-300 font-mono font-bold">
            {healthyCount}/{totalCount}
          </span>
          <svg className={`w-3.5 h-3.5 text-emerald-400/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      );
    }

    if (status === 'degraded') {
      return (
        <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full font-medium flex items-center gap-2 whitespace-nowrap shadow-sm hover:border-amber-400 transition-all cursor-pointer select-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Partial Outage</span>
          <span className="text-[10px] bg-amber-950/80 px-1.5 py-0.2 rounded text-amber-300 font-mono font-bold">
            {healthyCount}/{totalCount}
          </span>
          <svg className={`w-3.5 h-3.5 text-amber-400/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      );
    }

    return (
      <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3.5 py-1.5 rounded-full font-medium flex items-center gap-2 whitespace-nowrap shadow-sm hover:border-rose-400 transition-all cursor-pointer select-none">
        <span className="w-2 h-2 rounded-full bg-rose-400"></span>
        <span>Services Offline</span>
        <svg className={`w-3.5 h-3.5 text-rose-400/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    );
  };

  return (
    <div className="relative z-50" ref={popoverRef}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {getStatusBadge()}
      </div>

      {isOpen && (
        <div
          style={{ backgroundColor: '#020617', zIndex: 100 }}
          className="absolute right-0 top-10 mt-2 w-80 sm:w-96 bg-slate-950 border border-slate-700 rounded-2xl p-4 shadow-[0_25px_60px_15px_rgba(0,0,0,0.95)] z-[100] space-y-3.5"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                Microservices Topology
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Auto-polled every 30s • {healthyCount} of {totalCount} workers online
              </p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchHealth();
              }}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors disabled:opacity-50"
              title="Refresh Health Now"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Service List */}
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {health?.services && health.services.length > 0 ? (
              health.services.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        s.status === 'ok' ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    ></span>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">
                        {s.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {s.engine}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      :{s.port}
                    </span>
                    {s.status === 'ok' ? (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">
                        {s.latency_ms}ms
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-400 font-bold">
                        ERR
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Checking microservices health...
              </div>
            )}
          </div>

          {/* Footer with Timestamp */}
          {lastChecked && (
            <div className="text-[10px] text-slate-500 text-center border-t border-slate-900 pt-2 font-mono">
              Last check: {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
