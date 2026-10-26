import React, { useRef } from 'react';

export interface TabDef {
  id: string;
  label: string;
  hint?: string; // keyboard shortcut or count
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}

/** WAI-ARIA tablist with roving tabindex and arrow/Home/End key support. */
export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange, label }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = enabled.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-slate-800 [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-t-lg disabled:opacity-40 disabled:cursor-not-allowed ${
              selected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.hint && <span className="ml-1.5 text-[10px] font-mono text-slate-500">{tab.hint}</span>}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-sky-400" />}
          </button>
        );
      })}
    </div>
  );
};
