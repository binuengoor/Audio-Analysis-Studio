import React, { useEffect, useState } from 'react';
import { LibraryEntry } from '../types';

interface MetaEditorProps {
  entry: LibraryEntry;
  knownTags: string[];
  onSave: (patch: { rating?: number; notes?: string; tags?: string[] }) => Promise<boolean>;
}

/** Rating, tags and notes for a track. Saved immediately (rating/tags) or on blur (notes). */
export const MetaEditor: React.FC<MetaEditorProps> = ({ entry, knownTags, onSave }) => {
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const tags = entry.tags ?? [];
  const rating = entry.rating ?? 0;

  useEffect(() => {
    setNotes(entry.notes ?? '');
    setTagInput('');
  }, [entry.id, entry.notes]);

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32);
    if (!tag || tags.includes(tag) || tags.length >= 20) {
      setTagInput('');
      return;
    }
    setTagInput('');
    void onSave({ tags: [...tags, tag] });
  };

  const suggestions = knownTags.filter((t) => !tags.includes(t) && t.includes(tagInput.trim().toLowerCase())).slice(0, 6);
  const focus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rating, tags &amp; notes</h3>

      <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => void onSave({ rating: rating === n ? 0 : n })}
            className={`text-xl leading-none px-0.5 rounded ${focus} ${n <= rating ? 'text-amber-300' : 'text-slate-600 hover:text-slate-400'}`}
          >
            ★
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-xs text-slate-400">click the same star to clear</span>}
      </div>

      <div>
        <label htmlFor="tag-input" className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Tags</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/30 text-xs">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => void onSave({ tags: tags.filter((x) => x !== t) })} className={`w-4 h-4 rounded-full hover:bg-sky-500/30 ${focus}`}>×</button>
            </span>
          ))}
          <input
            id="tag-input"
            list="known-tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                void onSave({ tags: tags.slice(0, -1) });
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder={tags.length ? 'add tag…' : 'e.g. peak time, vocal, warm-up'}
            className={`bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white w-44 focus:border-purple-500 ${focus}`}
          />
          <datalist id="known-tags">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      </div>

      <div>
        <label htmlFor="track-notes" className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Notes</label>
        <textarea
          id="track-notes"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (entry.notes ?? '') && void onSave({ notes })}
          placeholder="Mix-in point, vocal samples, where you found it…"
          className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-purple-500 ${focus}`}
        />
      </div>
    </div>
  );
};
