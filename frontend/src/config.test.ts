import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBackendUrl, buildFileUrl, setApiKey, apiFetch } from './config';

describe('config buildBackendUrl', () => {
  it('formats paths correctly with leading slash', () => {
    const url = buildBackendUrl('/api/health');
    expect(url).toContain('/api/health');
  });

  it('formats paths correctly without leading slash', () => {
    const url = buildBackendUrl('api/health');
    expect(url).toContain('/api/health');
  });
});

describe('API key handling', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the stored key to media URLs as a query param', () => {
    expect(buildFileUrl('/files/input/a b.mp3')).not.toContain('api_key');
    setApiKey('s3cret&=');
    expect(buildFileUrl('/files/input/a.mp3')).toContain('?api_key=s3cret%26%3D');
    expect(buildFileUrl('/api/download/input/a.mp3?x=1')).toContain('&api_key=');
  });

  it('sends X-API-Key and raises the auth event on 401', async () => {
    setApiKey('k1');
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const onAuth = vi.fn();
    const win = { dispatchEvent: onAuth };
    vi.stubGlobal('window', win);

    await apiFetch('/api/library');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-API-Key')).toBe('k1');
    expect(onAuth).toHaveBeenCalledTimes(1);
  });
});
