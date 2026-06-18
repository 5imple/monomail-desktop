import { net } from 'electron';
import {
  buildGraphUrl,
  parseRetryAfterMs,
  withImmutableIdPrefer
} from '@/main/services/ipc-handlers/graph/graphHttp';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';

export interface GraphMainResult<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  /** The Graph error body's `error.code`, used to classify delta-cursor failures. */
  code?: string;
  /** Parsed Retry-After (ms) when the server throttles (429/503). */
  retryAfterMs?: number;
  error?: string;
}

/**
 * Main-process Graph GET. The renderer/worker `graphApiClient` routes Graph
 * requests through `window.electronBridge.graphRequest`, which does not exist
 * in the main process — so the delta poller (Phase 11, main process) needs this
 * direct transport. It mirrors the `main:graph:request` IPC handler exactly:
 * net.fetch + the unconditional immutable-id Prefer header (A1) + a
 * provider-resolved Microsoft bearer. `path` may be a v1.0-relative path or an
 * opaque absolute Graph delta URL; both are origin-validated by buildGraphUrl,
 * so a stored deltaLink is never fetched through a raw client.
 */
export async function graphGetMain<T = unknown>(
  uid: string,
  path: string,
  signal?: AbortSignal
): Promise<GraphMainResult<T>> {
  const url = buildGraphUrl(path);
  if (!url) return { ok: false, error: 'Invalid Graph request path' };

  let accessToken: string;
  try {
    ({ accessToken } = await tokenManager.getMicrosoftAccountAccessToken(uid));
  } catch (err) {
    // Auth resolution failed (no account / refresh rejected) — surface as an
    // auth failure so the caller keeps the cursor and waits for re-auth.
    return { ok: false, status: 401, error: err instanceof Error ? err.message : 'Auth failed' };
  }

  let response: Response;
  try {
    response = await net.fetch(url, {
      method: 'GET',
      headers: { ...withImmutableIdPrefer({}), Authorization: `Bearer ${accessToken}` },
      signal
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }

  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerMap[key] = value;
  });
  const retryAfterMs = parseRetryAfterMs(headerMap);

  let data: unknown = undefined;
  if (response.status !== 204) {
    const contentType = response.headers.get('content-type') ?? '';
    data = contentType.includes('application/json')
      ? await response.json().catch(() => undefined)
      : await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    const code = (data as { error?: { code?: string } } | undefined)?.error?.code;
    return { ok: false, status: response.status, data: data as T, code, retryAfterMs };
  }
  return { ok: true, status: response.status, data: data as T, retryAfterMs };
}

/**
 * Main-process Graph POST (with a JSON body). Companion to graphGetMain for the
 * scheduler, which runs in main and cannot use the renderer-only mailProvider —
 * e.g. moving a reminded conversation's messages back into the Inbox folder.
 * Mirrors graphGetMain's token + immutable-id Prefer + Retry-After handling.
 */
export async function graphPostMain<T = unknown>(
  uid: string,
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<GraphMainResult<T>> {
  const url = buildGraphUrl(path);
  if (!url) return { ok: false, error: 'Invalid Graph request path' };

  let accessToken: string;
  try {
    ({ accessToken } = await tokenManager.getMicrosoftAccountAccessToken(uid));
  } catch (err) {
    return { ok: false, status: 401, error: err instanceof Error ? err.message : 'Auth failed' };
  }

  let response: Response;
  try {
    response = await net.fetch(url, {
      method: 'POST',
      headers: {
        ...withImmutableIdPrefer({}),
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }

  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerMap[key] = value;
  });
  const retryAfterMs = parseRetryAfterMs(headerMap);

  let data: unknown = undefined;
  if (response.status !== 204) {
    const contentType = response.headers.get('content-type') ?? '';
    data = contentType.includes('application/json')
      ? await response.json().catch(() => undefined)
      : await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    const code = (data as { error?: { code?: string } } | undefined)?.error?.code;
    return { ok: false, status: response.status, data: data as T, code, retryAfterMs };
  }
  return { ok: true, status: response.status, data: data as T, retryAfterMs };
}
