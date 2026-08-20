import { create } from 'zustand';
import { AudioFile, AnalysisResult, LibraryEntry } from '../types';
import { buildBackendUrl } from '../config';

interface AppState {
  queue: AudioFile[];
  library: LibraryEntry[];
  processing: boolean;
  progress: number;
  activeEntryId: string | null;
  activeAnalysis: AnalysisResult | null;
  activeAudioUrl: string | null;
  activeTitle: string | null;
  isAnalyzing: boolean;

  fetchLibrary: () => Promise<void>;
  selectTrack: (entry: LibraryEntry) => void;
  reanalyzeTrack: (filename: string) => Promise<void>;
  addAudioFiles: (files: File[]) => Promise<void>;
  updateFileStatus: (id: string, status: AudioFile['status']) => void;
  pollBatchStatus: () => Promise<void>;
  processOutput: (filename: string, pattern: string, bpm: number, key: string, camelot: string) => Promise<void>;
  deleteInput: (id: string) => Promise<void>;
  deleteOutput: (id: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clearLibrary: () => Promise<void>;
}

export const useAudioStore = create<AppState>((set, get) => ({
  queue: [],
  library: [],
  processing: false,
  progress: 0,
  activeEntryId: null,
  activeAnalysis: null,
  activeAudioUrl: null,
  activeTitle: null,
  isAnalyzing: false,

  fetchLibrary: async () => {
    try {
      const response = await fetch(buildBackendUrl('/api/library'));
      if (!response.ok) throw new Error('Failed to fetch library');
      const newLibrary: LibraryEntry[] = await response.json();

      set((state: AppState) => {
        // Auto-select first analyzed entry if none active
        let currentActive = state.activeEntryId 
          ? newLibrary.find((e) => e.id === state.activeEntryId)
          : null;

        if (!currentActive && newLibrary.length > 0) {
          currentActive = newLibrary[0];
        }

        const activeAnalysis = currentActive?.analysis ?? state.activeAnalysis;
        const activeAudioUrl = currentActive 
          ? (currentActive.output_path 
              ? buildBackendUrl(`/files/output/${encodeURIComponent(currentActive.output_path)}`)
              : currentActive.input_path 
                ? buildBackendUrl(`/files/input/${encodeURIComponent(currentActive.input_path)}`)
                : null)
          : state.activeAudioUrl;

        return {
          library: newLibrary,
          activeEntryId: currentActive?.id ?? null,
          activeAnalysis,
          activeAudioUrl,
          activeTitle: currentActive?.filename ?? state.activeTitle,
        };
      });
    } catch (error) {
      console.error('Library fetch error', error);
    }
  },

  selectTrack: (entry: LibraryEntry) => {
    const audioUrl = entry.output_path 
      ? buildBackendUrl(`/files/output/${encodeURIComponent(entry.output_path)}`)
      : entry.input_path 
        ? buildBackendUrl(`/files/input/${encodeURIComponent(entry.input_path)}`)
        : null;

    set({
      activeEntryId: entry.id,
      activeAnalysis: entry.analysis,
      activeAudioUrl: audioUrl,
      activeTitle: entry.filename,
    });
  },

  reanalyzeTrack: async (filename: string) => {
    set({ isAnalyzing: true });
    try {
      const response = await fetch(buildBackendUrl('/api/reanalyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) throw new Error('Re-analysis failed');
      const result: AnalysisResult = await response.json();

      set({ activeAnalysis: result, isAnalyzing: false });
      await get().fetchLibrary();
    } catch (error) {
      console.error('Re-analysis failed:', error);
      set({ isAnalyzing: false });
      alert(`Re-analysis failed: ${error}`);
    }
  },

  addAudioFiles: async (files: File[]) => {
    if (files.length === 0) return;

    set({ processing: true, progress: 0 });

    const filenames: string[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const uploadRes = await fetch(buildBackendUrl('/api/upload'), {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const entry: LibraryEntry = await uploadRes.json();
          filenames.push(entry.filename);
          // Set preview URL for immediate display
          set({
            activeEntryId: entry.id,
            activeTitle: entry.filename,
            activeAudioUrl: URL.createObjectURL(file),
            activeAnalysis: null,
          });
        }
      } catch (err) {
        console.error('File upload failed for', file.name, err);
      }
    }

    if (filenames.length === 0) {
      set({ processing: false });
      return;
    }

    // Refresh library with uploaded entries
    await get().fetchLibrary();

    // Trigger batch analysis queue for all uploaded files
    try {
      await fetch(buildBackendUrl('/api/queue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames }),
      });

      // Poll batch status until completed
      const pollInterval = setInterval(async () => {
        await get().pollBatchStatus();
        const { processing } = get();
        if (!processing) {
          clearInterval(pollInterval);
          await get().fetchLibrary();
        }
      }, 1000);

    } catch (error) {
      console.error('Batch queue error:', error);
      set({ processing: false });
    }
  },

  updateFileStatus: (id: string, status: AudioFile['status']) => {
    set((state) => ({
      queue: state.queue.map((f) => f.id === id ? { ...f, status } : f)
    }));
  },

  pollBatchStatus: async () => {
    try {
      const response = await fetch(buildBackendUrl('/api/status'));
      const status = await response.json();
      
      set((state: AppState) => {
        const isProc = status.is_processing;
        const total = status.total_count || 1;
        const processed = status.processed_count || 0;
        const progress = Math.round((processed / total) * 100);

        // Update active analysis if current active file finished
        let currentAnalysis = state.activeAnalysis;
        if (state.activeTitle && status.results[state.activeTitle]) {
          currentAnalysis = status.results[state.activeTitle];
        }

        return {
          processing: isProc,
          progress: isProc ? progress : 100,
          activeAnalysis: currentAnalysis,
        };
      });

      if (!status.is_processing) {
        await get().fetchLibrary();
      }
    } catch (error) {
      console.error('Polling failed', error);
    }
  },

  processOutput: async (filename: string, pattern: string, bpm: number, key: string, camelot: string) => {
    try {
      const response = await fetch(buildBackendUrl('/api/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          pattern,
          bpm,
          key,
          camelot,
        }),
      });

      if (!response.ok) throw new Error('Processing failed');
      const data = await response.json();

      await get().fetchLibrary();
      alert(`Success! Processed & saved as: ${data.output_filename}`);
    } catch (error) {
      console.error('Process error:', error);
      alert('Failed to process file');
    }
  },

  deleteInput: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}/input`), { method: 'DELETE' });
      await get().fetchLibrary();
    } catch (error) {
      console.error('Delete input failed', error);
    }
  },

  deleteOutput: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}/output`), { method: 'DELETE' });
      await get().fetchLibrary();
    } catch (error) {
      console.error('Delete output failed', error);
    }
  },

  deleteEntry: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}`), { method: 'DELETE' });
      await get().fetchLibrary();
    } catch (error) {
      console.error('Delete entry failed', error);
    }
  },

  clearLibrary: async () => {
    try {
      const response = await fetch(buildBackendUrl('/api/library'), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to clear library');
      set({ library: [], activeEntryId: null, activeAnalysis: null, activeAudioUrl: null, activeTitle: null });
    } catch (error) {
      console.error('Failed to clear library', error);
      alert('Failed to clear library');
    }
  },
}));
