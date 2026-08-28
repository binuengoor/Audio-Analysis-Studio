import { create } from 'zustand';
import { AudioFile, AnalysisResult, LibraryEntry, ToastMessage } from '../types';
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Library fetch error:', msg);
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
      const batchRes = await fetch(buildBackendUrl('/api/analyze/batch'), {
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
            const jobRes = await fetch(buildBackendUrl(`/api/jobs/${jobId}`));
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
          set({ processing: false, isAnalyzing: false, progress: 100 });
          await get().fetchLibrary();
          get().showToast('Batch analysis completed successfully!', 'success');
        } else {
          set({ processing: true, progress });
        }
      }, 2000);

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
      const intakeRes = await fetch(buildBackendUrl('/api/intake/url'), {
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

      // Set preview / active state
      const audioUrl = entry.input_path
        ? buildBackendUrl(`/files/input/${encodeURIComponent(entry.input_path)}`)
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
            const jobRes = await fetch(buildBackendUrl(`/api/jobs/${jobId}`));
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.status === 'SUCCESS') {
                clearInterval(pollJob);
                const completedAnalysis: AnalysisResult = jobData.result;
                if (get().activeTitle === completedAnalysis.filename) {
                  set({ activeAnalysis: completedAnalysis });
                }
                set({ processing: false, isAnalyzing: false, progress: 100 });
                await get().fetchLibrary();
                get().showToast(`Analysis completed for ${intakeData.title || entry.filename}`, 'success');
              } else if (jobData.status === 'FAILURE') {
                clearInterval(pollJob);
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
    } catch (error: unknown) {
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
      get().showToast(`Saved as: ${data.output_filename}`, 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Process error:', msg);
      get().showToast(`Failed to process file: ${msg}`, 'error');
    }
  },

  deleteInput: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}/input`), { method: 'DELETE' });
      await get().fetchLibrary();
      get().showToast('Input file deleted', 'info');
    } catch (error: unknown) {
      console.error('Delete input failed', error);
    }
  },

  deleteOutput: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}/output`), { method: 'DELETE' });
      await get().fetchLibrary();
      get().showToast('Output file deleted', 'info');
    } catch (error: unknown) {
      console.error('Delete output failed', error);
    }
  },

  deleteEntry: async (id: string) => {
    try {
      await fetch(buildBackendUrl(`/api/library/${id}`), { method: 'DELETE' });
      await get().fetchLibrary();
      get().showToast('Library entry deleted', 'info');
    } catch (error: unknown) {
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
      get().showToast('Library cleared completely', 'info');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to clear library', msg);
      get().showToast(`Failed to clear library: ${msg}`, 'error');
    }
  },
}));
