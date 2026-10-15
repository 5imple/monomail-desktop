import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runUndoableAction } from '@/renderer/app/lib/commands/undoableAction';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/sonner.mjs.
// @ts-expect-error — test-only exports of the stub
import { __toastCalls, __resetToasts } from 'sonner';

// runUndoableAction is what Done / Trash / read / star / spam / move run
// behind: Undo (its button, and Z) must work from the moment the toast shows,
// not only once the server confirmed (a Microsoft move takes a second or two).

beforeEach(() => __resetToasts());

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(perform: () => Promise<unknown>) {
  const added: any[] = [];
  const removed: Array<string | number> = [];
  const undos: Promise<unknown>[] = [];
  runUndoableAction({
    perform,
    undo: (performed) => {
      undos.push(performed);
    },
    message: 'Done',
    errorMessage: 'Error marking conversation as done',
    undoLabel: 'Undo',
    addUndoAction: (action) => added.push(action),
    removeUndoAction: (toastId) => removed.push(toastId)
  });
  return { added, removed, undos };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('runUndoableAction: the toast and its Undo are there before the action settles', () => {
  const action = deferred();
  const { added } = setup(() => action.promise);
  const [shown] = __toastCalls();
  assert.equal(shown.type, 'success');
  assert.equal(shown.message, 'Done');
  assert.ok(shown.action, 'the toast offers Undo');
  assert.equal(added.length, 1, 'Z has something to undo already');
  assert.equal(added[0].toastId, shown.id);
});

test('runUndoableAction: an early undo runs at once and hands over the pending action', async () => {
  const action = deferred();
  const { added, removed, undos } = setup(() => action.promise);
  await added[0].execute();
  assert.equal(undos.length, 1);
  assert.ok(__toastCalls().some((call: any) => call.type === 'dismiss'));
  assert.deepEqual(removed, [__toastCalls()[0].id]);
  // The undo waits on the same action for its server half.
  let settled = false;
  undos[0].then(() => (settled = true));
  await tick();
  assert.equal(settled, false);
  action.resolve();
  await tick();
  assert.equal(settled, true);
});

test('runUndoableAction: Undo runs once (button and Z both)', async () => {
  const { added, undos } = setup(() => Promise.resolve());
  await added[0].execute();
  await added[0].execute();
  assert.equal(undos.length, 1);
});

test('runUndoableAction: a refused action becomes the error, without Undo', async () => {
  const action = deferred();
  const { added, removed, undos } = setup(() => action.promise);
  action.reject(new Error('Graph mutation failed (status 500)'));
  await tick();
  const error = __toastCalls().find((call: any) => call.type === 'error');
  assert.equal(error.message, 'Error marking conversation as done');
  assert.equal(error.id, __toastCalls()[0].id, 'it replaces the Done toast');
  assert.equal(error.action, undefined, 'no Undo on the error');
  assert.equal(removed.length, 1, 'Z no longer undoes it');
  await added[0].execute();
  assert.equal(undos.length, 0, 'nothing to undo: it was rolled back');
});

test('runUndoableAction: no error toast for an action undone before it failed', async () => {
  const action = deferred();
  const { added } = setup(() => action.promise);
  await added[0].execute();
  action.reject(new Error('refused'));
  await tick();
  assert.equal(
    __toastCalls().some((call: any) => call.type === 'error'),
    false
  );
});
