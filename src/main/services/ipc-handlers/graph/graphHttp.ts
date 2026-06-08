// Pure HTTP helpers for the Graph IPC handler: URL building with delta-link
// origin validation, method/header sanitization, the unconditional immutable-id
// Prefer header (A1), and $batch chunking / Retry-After parsing. Kept free of
// electron/net imports so the security- and A1-critical logic is unit-testable.

export const GRAPH_HOST = 'graph.microsoft.com';
export const GRAPH_BASE_URL = `https://${GRAPH_HOST}/v1.0`;
export const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
export const FORWARDED_HEADERS = new Set(['accept', 'content-type', 'prefer', 'consistencylevel']);

// [A1] Every Graph request — including resumed delta nextLink/deltaLink calls —
// must carry this. Without it Graph message ids change on folder move, so this
// plan's own archive/trash operations (moves) would invalidate every cached id.
export const IMMUTABLE_ID_PREFER = 'IdType="ImmutableId"';
export const MAX_BATCH_OPS = 20;
export const MAX_BATCH_RETRIES = 3;
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Accepts a path relative to the v1.0 base, or an opaque absolute Graph URL
 * (delta links). Absolute URLs are origin-validated: only graph.microsoft.com
 * over https is allowed — never fetch a stored delta URL through a raw client.
 */
export function buildGraphUrl(path: unknown): string | null {
  if (typeof path !== 'string' || !path) return null;
  if (/[\r\n]/.test(path)) return null;

  if (path.startsWith('https://')) {
    try {
      const url = new URL(path);
      if (url.protocol !== 'https:' || url.hostname !== GRAPH_HOST) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return `${GRAPH_BASE_URL}${path}`;
}

export function sanitizeMethod(method: unknown): string | null {
  if (typeof method !== 'string') return null;
  const normalized = method.toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : null;
}

export function sanitizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).flatMap(([key, value]) => {
      if (!FORWARDED_HEADERS.has(key.toLowerCase()) || typeof value !== 'string') return [];
      return [[key, value]];
    })
  );
}

/**
 * Returns headers with the immutable-id Prefer guaranteed present. A caller's
 * own Prefer values (e.g. odata.maxpagesize for delta paging) are preserved and
 * the IdType token is appended — Graph honours comma-separated Prefer values.
 */
export function withImmutableIdPrefer(headers: Record<string, string>): Record<string, string> {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === 'prefer');
  const existing = existingKey ? headers[existingKey] : '';

  if (!existing) return { ...headers, Prefer: IMMUTABLE_ID_PREFER };
  if (/idtype\s*=/i.test(existing)) return headers;

  const merged = `${existing}, ${IMMUTABLE_ID_PREFER}`;
  return { ...headers, [existingKey as string]: merged };
}

export function getErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object') {
    const maybeError = (data as { error?: unknown }).error;
    if (typeof maybeError === 'string') return maybeError;
    if (maybeError && typeof maybeError === 'object') {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return `Graph request failed (${status})`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function parseRetryAfterMs(headers: Record<string, string> | undefined): number {
  if (!headers) return 0;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'retry-after');
  const raw = key ? headers[key] : undefined;
  if (!raw) return 0;

  // RFC 7231 Retry-After is EITHER delta-seconds OR an HTTP-date.
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : 0;
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    const deltaMs = when - Date.now();
    return deltaMs > 0 ? Math.min(deltaMs, MAX_RETRY_AFTER_MS) : 0;
  }
  return 0;
}
