import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { ipcMain, net } from 'electron';
import log from 'electron-log';

type GraphRequestArgs = {
  method?: string;
  // Either a path relative to the v1.0 base ("/me/messages/...") or an opaque
  // absolute Graph URL (a delta @odata.nextLink / @odata.deltaLink).
  path?: string;
  uid?: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'json' | 'blob' | 'text';
};

type GraphResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; data?: unknown; error: string };

type GraphBatchSubRequest = {
  id: string;
  method: string;
  // Relative to the version base, e.g. "/me/messages/{id}" (Graph batch
  // urls are version-relative and must NOT include the /v1.0 prefix).
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

type GraphBatchArgs = {
  uid?: string;
  requests?: GraphBatchSubRequest[];
};

type GraphBatchSubResponse = {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

type GraphBatchResult =
  | { ok: true; responses: GraphBatchSubResponse[] }
  | { ok: false; status?: number; data?: unknown; error: string };

const GRAPH_HOST = 'graph.microsoft.com';
const GRAPH_BASE_URL = `https://${GRAPH_HOST}/v1.0`;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const FORWARDED_HEADERS = new Set(['accept', 'content-type', 'prefer', 'consistencylevel']);

// [A1] Every Graph request — including resumed delta nextLink/deltaLink calls —
// must carry this. Without it Graph message ids change on folder move, so this
// plan's own archive/trash operations (moves) would invalidate every cached id.
const IMMUTABLE_ID_PREFER = 'IdType="ImmutableId"';
const MAX_BATCH_OPS = 20;
const MAX_BATCH_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Accepts a path relative to the v1.0 base, or an opaque absolute Graph URL
 * (delta links). Absolute URLs are origin-validated: only graph.microsoft.com
 * over https is allowed — never fetch a stored delta URL through a raw client.
 */
function buildGraphUrl(path: unknown): string | null {
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

function sanitizeMethod(method: unknown): string | null {
  if (typeof method !== 'string') return null;
  const normalized = method.toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : null;
}

function sanitizeHeaders(headers: unknown): Record<string, string> {
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
function withImmutableIdPrefer(headers: Record<string, string>): Record<string, string> {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === 'prefer');
  const existing = existingKey ? headers[existingKey] : '';

  if (!existing) return { ...headers, Prefer: IMMUTABLE_ID_PREFER };
  if (/idtype\s*=/i.test(existing)) return headers;

  const merged = `${existing}, ${IMMUTABLE_ID_PREFER}`;
  return { ...headers, [existingKey as string]: merged };
}

async function readResponseBody(
  response: Response,
  responseType: GraphRequestArgs['responseType']
): Promise<unknown> {
  if (response.status === 204) return {};

  if (responseType === 'blob') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString('base64'), type: response.headers.get('content-type') ?? '' };
  }

  if (responseType === 'text') return response.text();

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function getErrorMessage(status: number, data: unknown): string {
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseRetryAfterMs(headers: Record<string, string> | undefined): number {
  if (!headers) return 0;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'retry-after');
  const raw = key ? headers[key] : undefined;
  const seconds = raw ? Number(raw) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * POSTs one $batch envelope and resolves throttling at the subrequest level.
 * A 200 on the batch envelope proves nothing about its items, so each 429
 * subresponse is re-batched on its own Retry-After until it clears or retries
 * are exhausted (the last 429 is then returned to the caller).
 */
async function runBatchChunk(
  accessToken: string,
  requests: GraphBatchSubRequest[]
): Promise<GraphBatchSubResponse[]> {
  const resolved = new Map<string, GraphBatchSubResponse>();
  let pending = requests;

  for (let attempt = 0; attempt <= MAX_BATCH_RETRIES && pending.length > 0; attempt++) {
    const envelope = {
      requests: pending.map((req) => ({
        id: req.id,
        method: req.method.toUpperCase(),
        url: req.url,
        headers: withImmutableIdPrefer(sanitizeHeaders(req.headers)),
        ...(req.body !== undefined ? { body: req.body } : {})
      }))
    };

    const response = await net.fetch(`${GRAPH_BASE_URL}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });

    if (!response.ok) {
      // Envelope-level failure (auth, malformed batch): surface against every
      // still-pending subrequest so the caller never silently loses items.
      const data = await readResponseBody(response, 'json');
      const status = response.status;
      for (const req of pending) {
        resolved.set(req.id, { id: req.id, status, body: data });
      }
      break;
    }

    const payload = (await response.json()) as { responses?: GraphBatchSubResponse[] };
    const subResponses = Array.isArray(payload.responses) ? payload.responses : [];
    const byId = new Map(subResponses.map((sub) => [sub.id, sub]));

    const stillThrottled: GraphBatchSubRequest[] = [];
    let waitMs = 0;
    for (const req of pending) {
      const sub = byId.get(req.id);
      if (sub && sub.status === 429 && attempt < MAX_BATCH_RETRIES) {
        stillThrottled.push(req);
        waitMs = Math.max(waitMs, parseRetryAfterMs(sub.headers));
      } else if (sub) {
        resolved.set(req.id, sub);
      } else {
        resolved.set(req.id, { id: req.id, status: 500, body: { error: 'No batch subresponse' } });
      }
    }

    pending = stillThrottled;
    if (pending.length > 0) await sleep(waitMs || 1000);
  }

  return requests.map(
    (req) => resolved.get(req.id) ?? { id: req.id, status: 429, body: { error: 'Throttled' } }
  );
}

export function registerGraphHandlers() {
  ipcMain.handle('main:graph:request', async (_event, args?: GraphRequestArgs) => {
    try {
      const url = buildGraphUrl(args?.path);
      if (!url) return { ok: false, error: 'Invalid Graph request path' } satisfies GraphResult;

      const method = sanitizeMethod(args?.method);
      if (!method) return { ok: false, error: 'Invalid Graph request method' } satisfies GraphResult;

      const uid = typeof args?.uid === 'string' && args.uid.trim() ? args.uid.trim() : null;
      if (!uid) return { ok: false, error: 'Graph account uid is required' } satisfies GraphResult;

      const { accessToken } = await tokenManager.getMicrosoftAccountAccessToken(uid);
      const headers = {
        ...withImmutableIdPrefer(sanitizeHeaders(args?.headers)),
        Authorization: `Bearer ${accessToken}`
      };

      const response = await net.fetch(url, {
        method,
        headers,
        body: typeof args?.body === 'string' ? args.body : undefined
      });

      const data = await readResponseBody(response, args?.responseType ?? 'json');
      if (!response.ok) {
        log.warn(`[graph:ipc] FAIL ${method} ${args?.path} uid=${uid} status=${response.status}`);
        return {
          ok: false,
          status: response.status,
          data,
          error: getErrorMessage(response.status, data)
        } satisfies GraphResult;
      }

      return { ok: true, status: response.status, data } satisfies GraphResult;
    } catch (error) {
      log.error(
        `[graph:ipc] ERROR ${args?.method} ${args?.path} uid=${args?.uid}:`,
        error instanceof Error ? error.message : error
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Graph request failed'
      } satisfies GraphResult;
    }
  });

  ipcMain.handle('main:graph:batch', async (_event, args?: GraphBatchArgs) => {
    try {
      const uid = typeof args?.uid === 'string' && args.uid.trim() ? args.uid.trim() : null;
      if (!uid) return { ok: false, error: 'Graph account uid is required' } satisfies GraphBatchResult;

      const requests = Array.isArray(args?.requests) ? args!.requests : null;
      if (!requests || requests.length === 0) {
        return { ok: false, error: 'Graph batch requires at least one request' } satisfies GraphBatchResult;
      }
      for (const req of requests) {
        if (!req || typeof req.id !== 'string' || !sanitizeMethod(req.method) || typeof req.url !== 'string') {
          return { ok: false, error: 'Invalid Graph batch subrequest' } satisfies GraphBatchResult;
        }
      }

      const { accessToken } = await tokenManager.getMicrosoftAccountAccessToken(uid);

      // Graph caps a $batch at 20 ops; chunk so callers can pass more.
      const responses: GraphBatchSubResponse[] = [];
      for (const group of chunk(requests, MAX_BATCH_OPS)) {
        responses.push(...(await runBatchChunk(accessToken, group)));
      }

      return { ok: true, responses } satisfies GraphBatchResult;
    } catch (error) {
      log.error('[graph:ipc] batch ERROR:', error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Graph batch failed'
      } satisfies GraphBatchResult;
    }
  });
}
