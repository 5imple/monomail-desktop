/**
 * The per-mailbox request slots every Graph call made from the main process
 * shares: the renderer's requests (main:graph:request) and the scheduler's
 * and delta poller's own (push/graphFetchMain). Apart, each stayed under
 * Graph's ~4-at-once limit on its own, but together they went over it, and a
 * snooze's folder lookups failed with 429.
 */

// Microsoft Graph throttles a single mailbox at ~4 concurrent requests (429
// "Application is over its MailboxConcurrency limit."). Cap our own per-mailbox
// single-request fan-out below that so bursts — e.g. the calendar fetching
// several month windows of /me/calendarView at once — don't throttle
// themselves. A tiny per-uid FIFO hands an in-flight slot to the next waiter on
// release; any 429/503 that still slips through is retried on Retry-After.
export const GRAPH_MAX_CONCURRENCY_PER_UID = 3;
export const GRAPH_REQUEST_MAX_RETRIES = 3;

// Two lanes share those slots. Calendar month reads (/me/calendarView, fired in
// bursts at startup) are "background": they may hold at most 2 slots, and a
// waiting mail request is always served before a waiting background one. With
// one FIFO, the startup inbox fetch queued behind the calendar burst and took
// ~5 s instead of ~0.2 s.
export type GraphLane = 'foreground' | 'background';
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

export function acquireGraphSlot(uid: string, lane: GraphLane): Promise<void> {
  const state = slotState(uid);
  if (canStart(state, lane)) {
    occupy(state, lane);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => state.waiting[lane].push(resolve));
}

export function releaseGraphSlot(uid: string, lane: GraphLane): void {
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
