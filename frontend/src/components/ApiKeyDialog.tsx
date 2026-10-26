import React, { useEffect, useRef, useState } from 'react';
import { AUTH_REQUIRED_EVENT, getApiKey, setApiKey } from '../config';
import { useAudioStore } from '../store/useAudioStore';

/** Prompts for the gateway API key when any request comes back 401, then reloads the library. */
export const ApiKeyDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchLibrary = useAudioStore((s) => s.fetchLibrary);

  useEffect(() => {
    const onAuthRequired = () => {
      setValue(getApiKey());
      setOpen(true);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setApiKey(value.trim());
    setOpen(false);
    void fetchLibrary();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-title"
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <form onSubmit={save} className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
        <div>
          <h2 id="api-key-title" className="text-lg font-bold text-white">API key required</h2>
          <p className="text-sm text-slate-400 mt-1">
            This server has authentication enabled. Enter the key configured in <code className="font-mono text-slate-300">API_KEY</code>.
          </p>
        </div>
        <input
          ref={inputRef}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="API key"
          className="w-full border border-slate-700 rounded-xl px-3.5 py-2 text-sm bg-slate-950 text-white focus:outline-none focus:border-purple-500"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white">
            Save key
          </button>
        </div>
      </form>
    </div>
  );
};
