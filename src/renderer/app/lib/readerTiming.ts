import log from 'electron-log';

/**
 * Dev-only timing of opening an email: from the row being chosen to the first
 * message body on screen, with the phases in between and how much of it the
 * main thread spent busy. The lines land in the dev log next to the network
 * timings from ApiClient, so when the reader feels slow the log says whether
 * the time went to the network, to parsing the HTML, to React, or to layout.
 *
 * Phases of an open (markReaderPhase), in the order they usually come:
 *   reader committed (metadata | bodies)  DisplayPanel's first commit of the thread
 *   skeleton shown                        the body placeholder is up (cold open)
 *   newest message arrived / body arrived the network (partial / full thread)
 *   store updated                         the thread is in the threads map
 *   reader committed with bodies          DisplayPanel rendered the bodies
 *   parsed <id> in N ms                   a card parsed its HTML (cache miss)
 *   first body committed <id>             a card's body is in the DOM
 *   first body on screen                  the frame with it was painted
 *   db saved                              the IndexedDB write after paint
 */

const enabled = Boolean(import.meta.env?.DEV);

// Phases this long after the open are not about the open any more.
const PHASE_WINDOW_MS = 15_000;

let openedThreadId: string | null = null;
let openedAt = 0;
let painted = false;
let phases = new Set<string>();
let longTasks: PerformanceObserver | null = null;
let busyMs = 0;
let busyCount = 0;

const sinceOpen = () => Math.round(performance.now() - openedAt);

const stopLongTasks = () => {
  longTasks?.disconnect();
  longTasks = null;
};

const watchLongTasks = () => {
  stopLongTasks();
  busyMs = 0;
  busyCount = 0;
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    longTasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // `buffered` also replays tasks from before this open (the whole
        // session's, up to the buffer limit). Count a task only if it was still
        // running at the open or started after it; the one the click itself
        // runs in began earlier and must count.
        if (entry.startTime + entry.duration < openedAt) continue;
        busyMs += entry.duration;
        busyCount += 1;
      }
    });
    longTasks.observe({ type: 'longtask', buffered: true });
  } catch {
    longTasks = null;
  }
};

/**
 * The reader is about to show `threadId` (null: it closed). Idempotent for the
 * thread already open, so it can be called while rendering.
 */
export function markReaderOpen(threadId: string | null): void {
  if (!enabled || threadId === openedThreadId) return;
  openedThreadId = threadId;
  openedAt = performance.now();
  painted = false;
  phases = new Set();
  if (threadId) {
    watchLongTasks();
    log.debug(`[reader] open ${threadId}`);
  } else {
    stopLongTasks();
  }
}

/**
 * A step of opening the email; each label is logged once per open. With
 * `threadId`, only for that thread (a prefetch of another thread is not a step
 * of this open). Steps after the first paint still log, for a while: the work
 * that follows it (persisting, the other cards) is what the next action waits on.
 */
export function markReaderPhase(label: string, threadId?: string | null): void {
  if (!enabled || !openedThreadId || phases.has(label)) return;
  if (threadId !== undefined && threadId !== openedThreadId) return;
  const elapsed = sinceOpen();
  if (elapsed > PHASE_WINDOW_MS) return;
  phases.add(label);
  log.debug(`[reader]   +${elapsed} ms ${label}${painted ? ' (after first paint)' : ''}`);
}

/** Whether `threadId` is the email being opened (always false outside dev). */
export function isReaderOpenFor(threadId: string | null | undefined): boolean {
  return enabled && !!threadId && threadId === openedThreadId;
}

/**
 * A message body of the open thread has been committed to the DOM; logged
 * once per open, once the frame showing it has been painted.
 */
export function markBodyPainted(threadId: string, messageId: string): void {
  if (!enabled || painted || threadId !== openedThreadId) return;
  painted = true;
  const committed = sinceOpen();
  const openedFor = openedThreadId;
  // A timeout queued from requestAnimationFrame runs after that frame paints.
  const afterPaint = (done: () => void) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(done, 0));
    } else {
      setTimeout(done, 0);
    }
  };
  afterPaint(() => {
    if (openedThreadId !== openedFor) return;
    const total = sinceOpen();
    // Long tasks (>50 ms) are reported after they end; give the current one a
    // moment to land before summing up.
    setTimeout(() => {
      if (openedThreadId !== openedFor) return;
      stopLongTasks();
      const busy =
        busyCount > 0
          ? `, main thread busy ${Math.round(busyMs)} ms in ${busyCount} long task(s)`
          : ', no long tasks';
      log.debug(
        `[reader] first body on screen ${total} ms after open (${messageId}, committed at ${committed} ms)${busy}`
      );
    }, 60);
  });
}
