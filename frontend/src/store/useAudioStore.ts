import { create } from 'zustand';
import { AudioFile, AnalysisResult, LibraryEntry, ToastMessage } from '../types';
import { buildBackendUrl } from '../config';

const activePollIntervals = new Set<ReturnType<typeof setInterval>>();

export const stopAllPolling = () => {
  activePollIntervals.forEach((intervalId) => clearInterval(intervalId));
  activePollIntervals.clear();
};

const JOB_POLL_INTERVAL_MS = 2000;
// Give up on jobs that never report a final state (lost task, worker crash) after this long
const JOB_POLL_TIMEOUT_MS = 30 * 60 * 1000;

interface JobPollSummary {
  failed: number;
  timedOut: number;
}

interface JobPollHandlers {
  onSuccess: (result: AnalysisResult) => Promise<void> | void;
  onFailure: (jobId: string, error: string) => Promise<void> | void;
  onProgress?: (remaining: number, total: number) => void;
  onFinished: (summary: JobPollSummary) => Promise<void> | void;
}

/** Polls Celery jobs until each succeeds, fails, or the timeout expires. */
const pollJobs = (jobIds: string[], handlers: JobPollHandlers) => {
  const pending = new Set(jobIds);
  const startedAt = Date.now();
  let failed = 0;
  let tickInFlight = false;

  const intervalId = setInterval(async () => {
    // Skip a tick if the previous one is still waiting on the network
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      for (const jobId of Array.from(pending)) {
        try {
          const jobRes = await fetch(buildBackendUrl(`/api/jobs/${jobId}`));
          if (!jobRes.ok) continue;
          const jobData = await jobRes.json();
          if (jobData.status === 'SUCCESS') {
            pending.delete(jobId);
            await handlers.onSuccess(jobData.result as AnalysisResult);
          } else if (jobData.status === 'FAILURE') {
            pending.delete(jobId);
            failed += 1;
            await handlers.onFailure(jobId, jobData.error || 'Unknown error');
          }
        } catch (e: unknown) {
          console.error(`Error polling job ${jobId}`, e);
        }
      }

      const timedOut = Date.now() - startedAt > JOB_POLL_TIMEOUT_MS ? pending.size : 0;
      if (pending.size === 0 || timedOut > 0) {
        clearInterval(intervalId);
        activePollIntervals.delete(intervalId);
        await handlers.onFinished({ failed, timedOut });
      } else {
        handlers.onProgress?.(pending.size, jobIds.length);
      }
    } finally {
      tickInFlight = false;
    }
  }, JOB_POLL_INTERVAL_MS);

  activePollIntervals.add(intervalId);
};

/** Names the engines that failed for a result, e.g. "key, chords", or null if all succeeded. */
export const failedEngines = (result: AnalysisResult | null | undefined): string | null => {
  const engines = Object.keys(result?.engine_errors ?? {});
  return engines.length > 0 ? engines.join(', ') : null;
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
        const newAudioUrl = currentActive 
          ? (currentActive.output_path 
              ? buildBackendUrl(`/files/output/${encodeURIComponent(currentActive.output_path)}`)
              : currentActive.input_path 
                ? buildBackendUrl(`/files/input/${encodeURIComponent(currentActive.input_path)}`)
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
      ? buildBackendUrl(`/files/output/${encodeURIComponent(entry.output_path)}`)
      : entry.input_path 
        ? buildBackendUrl(`/files/input/${encodeURIComponent(entry.input_path)}`)
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
      const failed = failedEngines(result);
      if (failed) {
        get().showToast(`Re-analysis finished for ${filename}, but these engines failed: ${failed}`, 'warning', 8000);
      } else {
        get().showToast(`Re-analysis complete for ${filename}`, 'success');
      }
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

      const failedEngineFiles: string[] = [];
      pollJobs(jobIds, {
        onSuccess: async (completedAnalysis) => {
          if (get().activeTitle === completedAnalysis.filename) {
            set({ activeAnalysis: completedAnalysis });
          }
          if (failedEngines(completedAnalysis) && completedAnalysis.filename) {
            failedEngineFiles.push(completedAnalysis.filename);
          }
          await get().fetchLibrary();
        },
        onFailure: async (jobId, error) => {
          console.error(`Job ${jobId} failed:`, error);
          get().showToast(`Analysis failed: ${error}`, 'error', 8000);
          await get().fetchLibrary();
        },
        onProgress: (remaining, total) => {
          set({ processing: true, progress: Math.round(((total - remaining) / total) * 100) });
        },
        onFinished: async ({ failed, timedOut }) => {
          set({ processing: false, isAnalyzing: false, progress: 100 });
          await get().fetchLibrary();
          if (timedOut > 0) {
            get().showToast(`${timedOut} analysis job(s) did not finish in time. Check the service status.`, 'warning', 8000);
          } else if (failed > 0) {
            get().showToast(`Batch finished: ${failed} of ${jobIds.length} file(s) failed.`, 'error', 8000);
          } else if (failedEngineFiles.length > 0) {
            get().showToast(`Batch finished, but some engines failed for: ${failedEngineFiles.join(', ')}`, 'warning', 8000);
          } else {
            get().showToast('Batch analysis completed successfully!', 'success');
          }
        },
      });

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

      // Revoke old blob preview if active
      revokeUrlIfBlob(get().activeAudioUrl);

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
        const title = intakeData.title || entry.filename;
        pollJobs([jobId], {
          onSuccess: async (completedAnalysis) => {
            if (get().activeTitle === completedAnalysis.filename) {
              set({ activeAnalysis: completedAnalysis });
            }
            const failed = failedEngines(completedAnalysis);
            if (failed) {
              get().showToast(`Analysis finished for ${title}, but these engines failed: ${failed}`, 'warning', 8000);
            } else {
              get().showToast(`Analysis completed for ${title}`, 'success');
            }
          },
          onFailure: (failedJobId, error) => {
            console.error(`Job ${failedJobId} failed:`, error);
            get().showToast(`Analysis failed: ${error}`, 'error', 8000);
          },
          onFinished: async ({ timedOut }) => {
            set({ processing: false, isAnalyzing: false, progress: 100 });
            await get().fetchLibrary();
            if (timedOut > 0) {
              get().showToast(`Analysis for ${title} did not finish in time. Check the service status.`, 'warning', 8000);
            }
          },
        });
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
      const res = await fetch(buildBackendUrl(`/api/library/${id}/input`), { method: 'DELETE' });
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
      const res = await fetch(buildBackendUrl(`/api/library/${id}/output`), { method: 'DELETE' });
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
      const res = await fetch(buildBackendUrl(`/api/library/${id}`), { method: 'DELETE' });
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
      const response = await fetch(buildBackendUrl('/api/library'), {
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
