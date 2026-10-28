import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createThreadCommands } from '@/renderer/app/lib/commands/threadCommands';
// @ts-expect-error — test-only exports of the stub
import { __toastCalls, __resetToasts } from 'sonner';

// Sending a reply archives its conversation through THREAD_DONE's quiet mode:
// no Done toast or Undo entry of its own (the send's Undo covers it), the
// reader closes back to the inbox (E moves on instead), and the handed-back
// undo puts it in the inbox.

beforeEach(() => __resetToasts());

function setup(activeThreadId: string | null, failDone = false) {
  const calls: string[] = [];
  const undoEntries: unknown[] = [];
  let opened: string | null | undefined;
  const commands = createThreadCommands({
    t: (key: string) => key,
    globalSearchQuery: 'in:inbox',
    selectedThreads: [],
    activeThreadId,
    filteredThreadIds: ['t1', 't2', 't3'],
    threadsMap: { t1: { id: 't1' }, t2: { id: 't2' }, t3: { id: 't3' } },
    setSelectedThreads: () => {},
    setActiveThreadId: (id) => {
      opened = id;
    },
    selectNextThread: () => {},
    groupThreadsByAccount: (ids) => ({ acc: ids }),
    addUndoAction: (action) => undoEntries.push(action),
    removeUndoAction: () => {},
    markThreadAsDone: (acc, ids, _api, _remove, _restore, after) => {
      calls.push(`done ${acc} ${ids.join(',')}`);
      after?.();
      return failDone ? Promise.reject(new Error('server said no')) : Promise.resolve();
    },
    unmarkThreadAsDone: (acc, ids, callApi) => {
      calls.push(`undone ${acc} ${ids.join(',')}${callApi ? '' : ' (local only)'}`);
      return Promise.resolve();
    },
    unmarkThreadAsSpam: () => {},
    markThreadAsSpam: () => {},
    unmarkThreadsAsUnread: () => {},
    markThreadsAsUnread: () => {},
    markThreadAsStar: () => {},
    unmarkThreadAsStar: () => {},
    unmarkThreadAsTrash: () => {},
    markThreadAsTrash: () => {}
  });
  return { commands, calls, undoEntries, opened: () => opened };
}

test('quiet Done archives with no toast or undo entry of its own, and hands back an undo', async () => {
  const { commands, calls, undoEntries } = setup(null);
  let undo: (() => void) | undefined;
  await commands.THREAD_DONE!.action({
    threadIds: ['t2'],
    onQuietUndo: (u: () => void) => (undo = u)
  });
  assert.deepEqual(calls, ['done acc t2']);
  assert.equal(undoEntries.length, 0, 'no Undo entry: Z belongs to the send');
  assert.equal(__toastCalls().length, 0, 'no "Marked as done" toast over the sending toast');
  assert.ok(undo, 'undo handed back');
  undo!();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ['done acc t2', 'undone acc t2']);
});

test('sending from the reader closes it, back to the inbox', async () => {
  const { commands, opened } = setup('t2');
  await commands.THREAD_DONE!.action({
    threadIds: ['t2'],
    returnToList: true,
    onQuietUndo: () => {}
  });
  assert.equal(opened(), null);
});

test('E on the open email still opens the next one', async () => {
  const { commands, opened } = setup('t2');
  await commands.THREAD_DONE!.action({ threadIds: ['t2'] });
  assert.equal(opened(), 't3');
});

test('plain Done still shows its toast and registers Undo', async () => {
  const { commands, undoEntries } = setup(null);
  await commands.THREAD_DONE!.action({ threadIds: ['t1'] });
  assert.equal(undoEntries.length, 1);
  assert.ok(__toastCalls().length > 0);
});

test('with waitFor the handed-back undo is local only (the server was never told)', async () => {
  const { commands, calls } = setup(null);
  let undo: (() => void) | undefined;
  await commands.THREAD_DONE!.action({
    threadIds: ['t2'],
    waitFor: new Promise(() => {}),
    onQuietUndo: (u: () => void) => (undo = u)
  });
  undo!();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ['done acc t2', 'undone acc t2 (local only)']);
});

test('a quiet archive the server refuses says so', async () => {
  const { commands } = setup(null, true);
  await commands.THREAD_DONE!.action({ threadIds: ['t2'], onQuietUndo: () => {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(
    __toastCalls().some((c: any) => c.type === 'error' && c.message === 'toast.thread.done_error')
  );
});
