// localStorage-backed local cache for offline/standalone mode.
// Signatures and templates are persisted here so they survive app restarts
// when the backend is unreachable.

const PREFIX = 'monomail:';

function get<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function set(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export const localDataStore = { get, set };
