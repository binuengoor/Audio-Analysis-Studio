import React from 'react';
import { useAudioStore } from '../store/useAudioStore';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAudioStore();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const bgColors = {
          success: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 shadow-emerald-500/10',
          error: 'bg-rose-950/95 border-rose-500/50 text-rose-200 shadow-rose-500/10',
          info: 'bg-slate-900/95 border-purple-500/50 text-slate-200 shadow-purple-500/10',
          warning: 'bg-amber-950/95 border-amber-500/50 text-amber-200 shadow-amber-500/10',
        }[toast.type || 'info'];

        const icons = {
          success: '✓',
          error: '✕',
          info: 'ℹ',
          warning: '⚠',
        }[toast.type || 'info'];

        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 ${bgColors}`}
          >
            <div aria-hidden="true" className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs bg-white/10 shrink-0 mt-0.5">
              {icons}
            </div>
            <div className="flex-1 text-xs leading-relaxed font-medium">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="text-white/60 hover:text-white text-xs shrink-0 transition-colors"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};
