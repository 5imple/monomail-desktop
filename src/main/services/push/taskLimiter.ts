// Bounded-concurrency task runner, shared with the renderer (MessageContext runs
// push-frame message fetches through it). Must stay dependency-free: no
// electron, node or DOM imports.

export interface TaskLimiter {
  /** Runs `task` once fewer than `concurrency` tasks are running; settles with it. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /**
   * Like run(), but a second call with a key that is still queued or running
   * shares the first call's promise instead of running again.
   */
  runOnce<T>(key: string, task: () => Promise<T>): Promise<T>;
  readonly running: number;
  readonly queued: number;
}

export function createTaskLimiter(concurrency: number): TaskLimiter {
  const limit = Math.max(1, Math.floor(concurrency));
  const waiting: Array<() => void> = [];
  const byKey = new Map<string, Promise<unknown>>();
  let running = 0;

  const next = () => {
    while (running < limit && waiting.length > 0) {
      running++;
      waiting.shift()?.();
    }
  };

  const run = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        // Promise.resolve().then(task) turns a synchronous throw into a rejection.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });

  const runOnce = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const existing = byKey.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run(task).finally(() => byKey.delete(key));
    byKey.set(key, promise);
    return promise;
  };

  return {
    run,
    runOnce,
    get running() {
      return running;
    },
    get queued() {
      return waiting.length;
    }
  };
}
