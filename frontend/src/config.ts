const sanitizeBase = (value: string) => value.replace(/\/$/, '');

const runtimeBase = import.meta.env.VITE_API_URL
  ? sanitizeBase(import.meta.env.VITE_API_URL)
  : (import.meta.env.DEV ? 'http://localhost:8000' : '');

export const API_BASE_URL = runtimeBase;

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

export const buildBackendUrl = (path: string) => {
  const normalizedPath = normalizePath(path);
  const candidate = `${API_BASE_URL}${normalizedPath}`;
  return candidate || normalizedPath;
};

const API_KEY_STORAGE = 'aas.apiKey';

export const AUTH_REQUIRED_EVENT = 'aas:auth-required';

export const getApiKey = (): string => {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};

export const setApiKey = (key: string) => {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* storage unavailable (private mode) - key lives only for this request */
  }
};

/** fetch() against the gateway that attaches the stored API key and signals the UI when a key is needed. */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('X-API-Key', key);
  const response = await fetch(buildBackendUrl(path), { ...init, headers });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
  return response;
};

/** URL for /files/* media; <audio>/<img> cannot send headers so the key travels as a query param. */
export const buildFileUrl = (path: string) => {
  const url = buildBackendUrl(path);
  const key = getApiKey();
  if (!key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
};
