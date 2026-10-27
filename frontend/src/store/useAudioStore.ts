import { create } from 'zustand';
import { AudioFile, AnalysisResult, LibraryEntry, ToastMessage } from '../types';
import { apiFetch, buildFileUrl } from '../config';

const activePollIntervals = new Set<ReturnType<typeof setInterval>>();

export const stopAllPolling = () => {
  activePollIntervals.forEach((intervalId) => clearInterval(intervalId));
  activePollIntervals.clear();
};

const revokeUrlIfBlob = (url: string | null) => {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
};

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
  toasts: ToastMessage[];

  showToast: (message: string, type?: ToastMessage['type'], durationMs?: number) => void;
  removeToast: (id: string) => void;
  fetchLibrary: () => Promise<void>;
  selectTrack: (entry: LibraryEntry) => void;
  reanalyzeTrack: (filename: string) => Promise<void>;
  addAudioFiles: (files: File[]) => Promise<void>;
  importAudioFromUrl: (url: string, audioFormat?: string) => Promise<void>;
  updateFileStatus: (id: string, status: AudioFile['status']) => void;
  pollBatchStatus: () => Promise<void>;
  processOutput: (filename: string, pattern: string, bpm: number | null, key: string | null, camelot: string | null) => Promise<void>;
  overrideAnalysis: (id: string, patch: { bpm?: number; key_camelot?: string; key_standard?: string }) => Promise<boolean>;
  updateMeta: (id: string, patch: { rating?: number; notes?: string; tags?: string[] }) => Promise<boolean>;
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
  toasts: [],

  showToast: (message: string, type: ToastMessage['type'] = 'info', durationMs: number = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = { id, message, type, durationMs };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    if (durationMs > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, durationMs);
    }
  },

  removeToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  fetchLibrary: async () => {
    try {
      const response = await apiFetch('/api/library');
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
        const newAudioUrl = currentActive 
          ? (currentActive.output_path 
              ? buildFileUrl(`/files/output/${encodeURIComponent(currentActive.output_path)}`)
              : currentActive.input_path 
                ? buildFileUrl(`/files/input/${encodeURIComponent(currentActive.input_path)}`)
                : null)
          : state.activeAudioUrl;

        if (state.activeAudioUrl && state.activeAudioUrl !== newAudioUrl) {
          revokeUrlIfBlob(state.activeAudioUrl);
        }

        return {
          library: newLibrary,
          activeEntryId: currentActive?.id ?? null,
          activeAnalysis,
          activeAudioUrl: newAudioUrl,
          activeTitle: currentActive?.filename ?? state.activeTitle,
        };
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Library fetch error:', msg);
      get().showToast(`Failed to fetch library: ${msg}`, 'error');
    }
  },

  selectTrack: (entry: LibraryEntry) => {
    const audioUrl = entry.output_path 
      ? buildFileUrl(`/files/output/${encodeURIComponent(entry.output_path)}`)
      : entry.input_path 
        ? buildFileUrl(`/files/input/${encodeURIComponent(entry.input_path)}`)
        : null;

    const currentUrl = get().activeAudioUrl;
    if (currentUrl && currentUrl !== audioUrl) {
      revokeUrlIfBlob(currentUrl);
    }

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
      const response = await apiFetch('/api/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) {
        let errDetail = 'Re-analysis failed';
        try {
          const errData = await response.json();
          errDetail = errData.detail || errDetail;
        } catch {}
        throw new Error(errDetail);
      }
      const result: AnalysisResult = await response.json();

      set({ activeAnalysis: result, isAnalyzing: false });
      await get().fetchLibrary();
      get().showToast(`Re-analysis complete for ${filename}`, 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Re-analysis failed:', msg);
      set({ isAnalyzing: false });
      get().showToast(`Re-analysis failed: ${msg}`, 'error');
    }
  },

  addAudioFiles: async (files: File[]) => {
    if (files.length === 0) return;

    set({ processing: true, isAnalyzing: true, progress: 0 });

    const filenames: string[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const uploadRes = await apiFetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const entry: LibraryEntry = await uploadRes.json();
          filenames.push(entry.filename);
          // Revoke old blob preview if active
          const oldUrl = get().activeAudioUrl;
          revokeUrlIfBlob(oldUrl);

          const previewUrl = URL.createObjectURL(file);
          // Set preview URL for immediate display
          set({
            activeEntryId: entry.id,
            activeTitle: entry.filename,
            activeAudioUrl: previewUrl,
            activeAnalysis: null,
          });
        } else {
          console.error('Upload failed with status', uploadRes.status);
          get().showToast(`Upload failed for ${file.name}`, 'error');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('File upload failed for', file.name, msg);
        get().showToast(`File upload failed for ${file.name}: ${msg}`, 'error');
      }
    }

    if (filenames.length === 0) {
      set({ processing: false, isAnalyzing: false });
      return;
    }

    // Refresh library with uploaded entries
    await get().fetchLibrary();
    get().showToast(`Uploaded ${filenames.length} file(s). Analyzing...`, 'info');

    // Trigger Celery asynchronous batch queue for all uploaded files
    try {
      const batchRes = await apiFetch('/api/analyze/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames }),
      });

      if (!batchRes.ok) throw new Error('Failed to dispatch batch analysis');
      const batchData = await batchRes.json();
      const jobIds: string[] = batchData.job_ids || [];

      if (jobIds.length === 0) {
        set({ processing: false, isAnalyzing: false });
        return;
      }

      // Poll each job every 2 seconds until completed
      const pendingJobIds = new Set(jobIds);
      const totalJobs = jobIds.length;

      const pollInterval = setInterval(async () => {
        for (const jobId of Array.from(pendingJobIds)) {
          try {
            const jobRes = await apiFetch(`/api/jobs/${jobId}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.status === 'SUCCESS') {
                pendingJobIds.delete(jobId);
                const completedAnalysis: AnalysisResult = jobData.result;
                if (get().activeTitle === completedAnalysis.filename) {
                  set({ activeAnalysis: completedAnalysis });
                }
                await get().fetchLibrary();
              } else if (jobData.status === 'FAILURE') {
                console.error(`Job ${jobId} failed:`, jobData.error);
                pendingJobIds.delete(jobId);
              }
            }
          } catch (e: unknown) {
            console.error(`Error polling job ${jobId}`, e);
          }
        }

        const remaining = pendingJobIds.size;
        const progress = Math.round(((totalJobs - remaining) / totalJobs) * 100);

        if (remaining === 0) {
          clearInterval(pollInterval);
          activePollIntervals.delete(pollInterval);
          set({ processing: false, isAnalyzing: false, progress: 100 });
          await get().fetchLibrary();
          get().showToast('Batch analysis completed successfully!', 'success');
        } else {
          set({ processing: true, progress });
        }
      }, 2000);

      activePollIntervals.add(pollInterval);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Batch queue error:', msg);
      set({ processing: false, isAnalyzing: false });
      get().showToast(`Batch queue error: ${msg}`, 'error');
    }
  },

  importAudioFromUrl: async (url: string, audioFormat: string = 'flac') => {
    set({ processing: true, isAnalyzing: true, progress: 10 });
    try {
      const intakeRes = await apiFetch('/api/intake/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          audio_format: audioFormat,
          auto_analyze: true,
        }),
      });

      if (!intakeRes.ok) {
        let errMsg = 'Failed to intake audio from URL';
        try {
          const errData = await intakeRes.json();
          errMsg = errData.detail || errMsg;
        } catch {
          // fallback
        }
        throw new Error(errMsg);
      }

      const intakeData = await intakeRes.json();
      const entry: LibraryEntry = intakeData.entry;
      const jobId: string | undefined = intakeData.job_id;

      // Revoke old blob preview if active
      revokeUrlIfBlob(get().activeAudioUrl);

      // Set preview / active state
      const audioUrl = entry.input_path
        ? buildFileUrl(`/files/input/${encodeURIComponent(entry.input_path)}`)
        : null;

      set({
        activeEntryId: entry.id,
        activeTitle: entry.filename,
        activeAudioUrl: audioUrl,
        activeAnalysis: null,
        progress: 40,
      });

      await get().fetchLibrary();
      get().showToast(`Imported audio stream for: ${intakeData.title || entry.filename}`, 'success');

      if (jobId) {
        // Poll the Celery job until completion
        const pollJob = setInterval(async () => {
          try {
            const jobRes = await apiFetch(`/api/jobs/${jobId}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.status === 'SUCCESS') {
                clearInterval(pollJob);
                activePollIntervals.delete(pollJob);
                const completedAnalysis: AnalysisResult = jobData.result;
                if (get().activeTitle === completedAnalysis.filename) {
                  set({ activeAnalysis: completedAnalysis });
                }
                set({ processing: false, isAnalyzing: false, progress: 100 });
                await get().fetchLibrary();
                get().showToast(`Analysis completed for ${intakeData.title || entry.filename}`, 'success');
              } else if (jobData.status === 'FAILURE') {
                clearInterval(pollJob);
                activePollIntervals.delete(pollJob);
                set({ processing: false, isAnalyzing: false });
                console.error(`Job ${jobId} failed:`, jobData.error);
                await get().fetchLibrary();
                get().showToast(`Analysis failed: ${jobData.error}`, 'error');
              }
            }
          } catch (e: unknown) {
            console.error(`Error polling job ${jobId}`, e);
          }
        }, 2000);

        activePollIntervals.add(pollJob);
      } else {
        set({ processing: false, isAnalyzing: false, progress: 100 });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('URL intake failed:', msg);
      set({ processing: false, isAnalyzing: false });
      get().showToast(`URL import failed: ${msg}`, 'error');
      throw error;
    }
  },

  updateFileStatus: (id: string, status: AudioFile['status']) => {
    set((state) => ({
      queue: state.queue.map((f) => f.id === id ? { ...f, status } : f)
    }));
  },

  pollBatchStatus: async () => {
    try {
      const response = await apiFetch('/api/status');
      if (!response.ok) throw new Error('Failed to fetch status');
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
    } catch (error: unknown) {
      console.error('Polling failed', error);
    }
  },

  processOutput: async (filename: string, pattern: string, bpm: number | null, key: string | null, camelot: string | null) => {
    try {
      const response = await apiFetch('/api/process', {
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
      get().showToast(`Saved as: ${data.output_filename}`, 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Process error:', msg);
      get().showToast(`Failed to process file: ${msg}`, 'error');
    }
  },

  overrideAnalysis: async (id, patch) => {
    try {
      const res = await apiFetch(`/api/library/${id}/analysis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Update rejected');
      }
      const entry: LibraryEntry = await res.json();
      set((state) => (state.activeEntryId === id ? { activeAnalysis: entry.analysis } : {}));
      await get().fetchLibrary();
      get().showToast('Saved your correction (kept on re-analysis)', 'success');
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      get().showToast(`Could not save correction: ${msg}`, 'error');
      return false;
    }
  },

  updateMeta: async (id, patch) => {
    try {
      const res = await apiFetch(`/api/library/${id}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Update rejected');
      }
      const entry: LibraryEntry = await res.json();
      // update in place so the table does not flicker or lose the selection
      set((state) => ({ library: state.library.map((e) => (e.id === id ? entry : e)) }));
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      get().showToast(`Could not save: ${msg}`, 'error');
      return false;
    }
  },

  deleteInput: async (id: string) => {
    try {
      const res = await apiFetch(`/api/library/${id}/input`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed with status ${res.status}`);
      await get().fetchLibrary();
      get().showToast('Input file deleted', 'info');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Delete input failed', msg);
      get().showToast(`Failed to delete input file: ${msg}`, 'error');
    }
  },

  deleteOutput: async (id: string) => {
    try {
      const res = await apiFetch(`/api/library/${id}/output`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed with status ${res.status}`);
      await get().fetchLibrary();
      get().showToast('Output file deleted', 'info');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Delete output failed', msg);
      get().showToast(`Failed to delete output file: ${msg}`, 'error');
    }
  },

  deleteEntry: async (id: string) => {
    try {
      const current = get().library.find((e) => e.id === id);
      if (current && get().activeEntryId === id) {
        revokeUrlIfBlob(get().activeAudioUrl);
      }
      const res = await apiFetch(`/api/library/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed with status ${res.status}`);
      await get().fetchLibrary();
      get().showToast('Library entry deleted', 'info');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Delete entry failed', msg);
      get().showToast(`Failed to delete entry: ${msg}`, 'error');
    }
  },

  clearLibrary: async () => {
    try {
      stopAllPolling();
      revokeUrlIfBlob(get().activeAudioUrl);
      const response = await apiFetch('/api/library', {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to clear library');
      set({ library: [], activeEntryId: null, activeAnalysis: null, activeAudioUrl: null, activeTitle: null, processing: false, isAnalyzing: false, progress: 0 });
      get().showToast('Library cleared completely', 'info');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to clear library', msg);
      get().showToast(`Failed to clear library: ${msg}`, 'error');
    }
  },
}));
