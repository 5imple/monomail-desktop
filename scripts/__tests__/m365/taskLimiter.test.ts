import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLimiter } from '@/main/services/push/taskLimiter';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setImmediate(r));

test('createTaskLimiter: never runs more than `concurrency` tasks at once', async () => {
  const limiter = createTaskLimiter(2);
  let running = 0;
  let peak = 0;
  const gates = Array.from({ length: 6 }, () => deferred());
  const done = gates.map((gate, i) =>
    limiter.run(async () => {
      running++;
      peak = Math.max(peak, running);
      await gate.promise;
      running--;
      return i;
    })
  );
  await tick();
  assert.equal(limiter.running, 2);
  assert.equal(limiter.queued, 4);
  gates.forEach((g) => g.resolve());
  assert.deepEqual(await Promise.all(done), [0, 1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.equal(limiter.running, 0);
});

test('createTaskLimiter: a failing (or synchronously throwing) task frees its slot', async () => {
  const limiter = createTaskLimiter(1);
  await assert.rejects(
    limiter.run(async () => {
      throw new Error('boom');
    }),
    /boom/
  );
  await assert.rejects(
    limiter.run((() => {
      throw new Error('sync');
    }) as () => Promise<void>),
    /sync/
  );
  assert.equal(await limiter.run(async () => 'next'), 'next');
});

test('createTaskLimiter: runOnce shares one run per key while it is queued or running', async () => {
  const limiter = createTaskLimiter(1);
  let calls = 0;
  const gate = deferred();
  const task = async () => {
    calls++;
    await gate.promise;
    return 'msg';
  };
  const a = limiter.runOnce('uid:m1', task);
  const b = limiter.runOnce('uid:m1', task); // duplicate frame for the same message
  gate.resolve();
  assert.deepEqual(await Promise.all([a, b]), ['msg', 'msg']);
  assert.equal(calls, 1);
  // Once settled, the key can run again (e.g. a later re-delivery).
  await limiter.runOnce('uid:m1', async () => {
    calls++;
  });
  assert.equal(calls, 2);
});

test('createTaskLimiter: a concurrency below 1 still makes progress', async () => {
  const limiter = createTaskLimiter(0);
  assert.equal(await limiter.run(async () => 42), 42);
});
