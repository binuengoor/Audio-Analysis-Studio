import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAudioStore, stopAllPolling } from './useAudioStore';
import { LibraryEntry } from '../types';

describe('useAudioStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAudioStore.setState({
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
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    stopAllPolling();
  });

  describe('Toast Notifications', () => {
    it('adds and removes toasts correctly', () => {
      const store = useAudioStore.getState();
      expect(store.toasts).toHaveLength(0);

      store.showToast('Test notification', 'info', 0);
      const stateWithToast = useAudioStore.getState();
      expect(stateWithToast.toasts).toHaveLength(1);
      expect(stateWithToast.toasts[0].message).toBe('Test notification');
      expect(stateWithToast.toasts[0].type).toBe('info');

      const toastId = stateWithToast.toasts[0].id;
      store.removeToast(toastId);
      expect(useAudioStore.getState().toasts).toHaveLength(0);
    });

    it('auto-expires toast after duration', async () => {
      vi.useFakeTimers();
      const store = useAudioStore.getState();

      store.showToast('Expiring toast', 'success', 2000);
      expect(useAudioStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(2500);
      expect(useAudioStore.getState().toasts).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  describe('Track Selection and URL Revocation', () => {
    it('selects track and sets active properties', () => {
      const sampleEntry: LibraryEntry = {
        id: 'entry-1',
        filename: 'test_song.mp3',
        input_path: 'test_song.mp3',
        output_path: 'test_song_out.mp3',
        status: 'completed',
        created_at: 1700000000,
        analysis: {
          bpm: 128,
          bpm_confidence: 0.95,
          key_standard: 'C major',
          key_camelot: '8B',
          key_confidence: 0.9,
          duration: 180,
          chords: [],
          segments: [],
        },
      };

      const store = useAudioStore.getState();
      store.selectTrack(sampleEntry);

      const state = useAudioStore.getState();
      expect(state.activeEntryId).toBe('entry-1');
      expect(state.activeTitle).toBe('test_song.mp3');
      expect(state.activeAnalysis?.bpm).toBe(128);
      expect(state.activeAudioUrl).toContain('test_song_out.mp3');
    });

    it('falls back to input_path when output_path is not present', () => {
      const sampleEntry: LibraryEntry = {
        id: 'entry-2',
        filename: 'input_only.wav',
        input_path: 'input_only.wav',
        output_path: null,
        analysis: null,
        status: 'uploaded',
        created_at: 1700000000,
      };

      const store = useAudioStore.getState();
      store.selectTrack(sampleEntry);

      const state = useAudioStore.getState();
      expect(state.activeEntryId).toBe('entry-2');
      expect(state.activeAudioUrl).toContain('/files/input/input_only.wav');
    });
  });

  describe('Library Management', () => {
    it('clears library and resets active states', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      } as Response);

      useAudioStore.setState({
        library: [{ id: 'e1', filename: 'song.mp3', input_path: 'song.mp3', output_path: null, analysis: null, status: 'completed', created_at: 1 }],
        activeEntryId: 'e1',
        activeTitle: 'song.mp3',
        activeAudioUrl: 'http://localhost/files/song.mp3',
        processing: true,
      });

      await useAudioStore.getState().clearLibrary();

      const state = useAudioStore.getState();
      expect(state.library).toEqual([]);
      expect(state.activeEntryId).toBeNull();
      expect(state.activeTitle).toBeNull();
      expect(state.activeAudioUrl).toBeNull();
      expect(state.processing).toBe(false);
    });

    it('handles delete input with error toast on failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await useAudioStore.getState().deleteInput('invalid-id');

      const state = useAudioStore.getState();
      expect(state.toasts.length).toBeGreaterThan(0);
      expect(state.toasts[0].type).toBe('error');
    });
  });
});
