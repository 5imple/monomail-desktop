import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { ipcMain, net } from 'electron';
import log from 'electron-log';
import {
  GRAPH_BASE_URL,
  MAX_BATCH_OPS,
  MAX_BATCH_RETRIES,
  buildGraphUrl,
  chunk,
  getErrorMessage,
  parseRetryAfterMs,
  sanitizeHeaders,
  sanitizeMethod,
  withImmutableIdPrefer
} from '@/main/services/ipc-handlers/graph/graphHttp';

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Microsoft Graph throttles a single mailbox at ~4 concurrent requests (429
// "Application is over its MailboxConcurrency limit."). Cap our own per-mailbox
// single-request fan-out below that so bursts — e.g. the calendar fetching
// several month windows of /me/calendarView at once — don't throttle
// themselves. A tiny per-uid FIFO hands an in-flight slot to the next waiter on
// release; any 429/503 that still slips through is retried on Retry-After.
const GRAPH_MAX_CONCURRENCY_PER_UID = 3;
const GRAPH_REQUEST_MAX_RETRIES = 3;

// Two lanes share those slots. Calendar month reads (/me/calendarView, fired in
// bursts at startup) are "background": they may hold at most 2 slots, and a
// waiting mail request is always served before a waiting background one. With
// one FIFO, the startup inbox fetch queued behind the calendar burst and took
// ~5 s instead of ~0.2 s.
type GraphLane = 'foreground' | 'background';
const GRAPH_MAX_BACKGROUND_PER_UID = 2;
const BACKGROUND_PATH = /\/me\/calendarView\b/i;

export function graphLaneFor(path: string | undefined): GraphLane {
  return path && BACKGROUND_PATH.test(path) ? 'background' : 'foreground';
}

interface GraphSlotState {
  total: number;
  background: number;
  waiting: Record<GraphLane, Array<() => void>>;
}
const graphSlotsByUid = new Map<string, GraphSlotState>();

function slotState(uid: string): GraphSlotState {
  let state = graphSlotsByUid.get(uid);
  if (!state) {
    state = { total: 0, background: 0, waiting: { foreground: [], background: [] } };
    graphSlotsByUid.set(uid, state);
  }
  return state;
}

function canStart(state: GraphSlotState, lane: GraphLane): boolean {
  if (state.total >= GRAPH_MAX_CONCURRENCY_PER_UID) return false;
  return lane === 'foreground' || state.background < GRAPH_MAX_BACKGROUND_PER_UID;
}

function occupy(state: GraphSlotState, lane: GraphLane): void {
  state.total += 1;
  if (lane === 'background') state.background += 1;
}

function acquireGraphSlot(uid: string, lane: GraphLane): Promise<void> {
  const state = slotState(uid);
  if (canStart(state, lane)) {
    occupy(state, lane);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => state.waiting[lane].push(resolve));
}

function releaseGraphSlot(uid: string, lane: GraphLane): void {
  const state = slotState(uid);
  state.total = Math.max(0, state.total - 1);
  if (lane === 'background') state.background = Math.max(0, state.background - 1);
  // Mail first, then background, each only while it may start.
  for (const next of ['foreground', 'background'] as const) {
    while (state.waiting[next].length > 0 && canStart(state, next)) {
      occupy(state, next);
      state.waiting[next].shift()?.();
    }
  }
  if (state.total === 0 && !state.waiting.foreground.length && !state.waiting.background.length) {
    graphSlotsByUid.delete(uid);
  }
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
      // A 429/503 on the $batch envelope ITSELF (Graph service-protection
      // throttling of the batch endpoint, with a top-level Retry-After) is
      // retryable — honor Retry-After and re-batch the whole pending set rather
      // than failing every item permanently (A9: honor Retry-After everywhere).
      if ((response.status === 429 || response.status === 503) && attempt < MAX_BATCH_RETRIES) {
        const waitMs = parseRetryAfterMs({
          'retry-after': response.headers.get('retry-after') ?? ''
        });
        await sleep(waitMs || 1000);
        continue;
      }
      // Genuinely permanent envelope failure (auth, malformed batch): surface
      // against every still-pending subrequest so the caller never silently
      // loses items.
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

      const requestBody = typeof args?.body === 'string' ? args.body : undefined;

      const lane = graphLaneFor(args?.path);
      await acquireGraphSlot(uid, lane);
      try {
        let response = await net.fetch(url, { method, headers, body: requestBody });

        // Honor Graph throttling: retry 429/503 on the server's Retry-After
        // (capped by parseRetryAfterMs) rather than dropping the request. With
        // the per-uid concurrency cap above, this keeps the calendar's
        // multi-month /me/calendarView burst from failing to load.
        for (
          let attempt = 0;
          (response.status === 429 || response.status === 503) &&
          attempt < GRAPH_REQUEST_MAX_RETRIES;
          attempt++
        ) {
          const waitMs = parseRetryAfterMs({
            'retry-after': response.headers.get('retry-after') ?? ''
          });
          try {
            await response.text(); // drain the throttled response so the socket frees
          } catch {
            // ignore — only releasing the connection
          }
          await sleep(waitMs || 1000);
          response = await net.fetch(url, { method, headers, body: requestBody });
        }

        const data = await readResponseBody(response, args?.responseType ?? 'json');
        if (!response.ok) {
          log.warn(
            `[graph:ipc] FAIL ${method} ${args?.path} uid=${uid} status=${response.status} :: ${getErrorMessage(response.status, data)}`
          );
          return {
            ok: false,
            status: response.status,
            data,
            error: getErrorMessage(response.status, data)
          } satisfies GraphResult;
        }

        return { ok: true, status: response.status, data } satisfies GraphResult;
      } finally {
        releaseGraphSlot(uid, lane);
      }
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

      // A >=400 subresponse inside a 200 envelope still resolves ok:true (the
      // caller decides what a partial failure means), but it must not be
      // invisible here — an archive move failing per-message used to surface
      // only as an opaque renderer error with a clean main.log.
      const subRequestById = new Map(
        requests.map((req) => [req.id, `${req.method.toUpperCase()} ${req.url}`])
      );
      for (const sub of responses) {
        if (sub.status >= 400) {
          log.warn(
            `[graph:ipc] batch sub FAIL ${subRequestById.get(sub.id) ?? `id=${sub.id}`} uid=${uid} status=${sub.status} :: ${getErrorMessage(sub.status, sub.body)}`
          );
        }
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
