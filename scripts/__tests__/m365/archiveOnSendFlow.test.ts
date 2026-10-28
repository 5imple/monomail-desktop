import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startArchiveOnSend } from '@/renderer/app/components/card/compose/archiveOnSend';
import type { ThreadCommandArgs } from '@/renderer/app/lib/commands/types';

// The send side of archive-on-send: what gets archived, and that the server
// archive waits for the reply to have actually gone.

const tick = () => new Promise((r) => setTimeout(r, 0));

function start(over: Partial<Parameters<typeof startArchiveOnSend>[0]> = {}) {
  const runs: ThreadCommandArgs[] = [];
  let undos = 0;
  const archive = startArchiveOnSend({
    threadId: 'conv-1',
    thread: { labelIds: ['INBOX'] },
    hasCachedReminder: () => false,
    checkReminder: async () => false,
    runDone: (args) => {
      runs.push(args);
      args.onQuietUndo?.(() => undos++);
    },
    ...over
  });
  // Where the server archive is: 'waiting', 'go' or 'skipped'.
  let gate = 'waiting';
  runs[0]?.waitFor?.then(
    () => (gate = 'go'),
    () => (gate = 'skipped')
  );
  return { archive, runs, undos: () => undos, gate: () => gate };
}

test('not archived: new message, not in the inbox, or a reminder in the cache', () => {
  assert.equal(start({ threadId: undefined }).runs.length, 0);
  assert.equal(start({ thread: undefined }).runs.length, 0);
  assert.equal(start({ thread: { labelIds: ['SENT'] } }).runs.length, 0);
  assert.equal(start({ hasCachedReminder: () => true }).runs.length, 0);
});

test('archived at once, back to the list; the server waits for the send', async () => {
  const s = start();
  assert.equal(s.runs.length, 1);
  assert.deepEqual(s.runs[0].threadIds, ['conv-1']);
  assert.equal(s.runs[0].returnToList, true);
  await tick();
  assert.equal(s.gate(), 'waiting', 'nothing reaches the server during the Undo countdown');
  s.archive.onSent();
  await tick();
  assert.equal(s.gate(), 'go');
  assert.equal(s.undos(), 0);
});

test('Undo / cancel / a failure before it goes: back in the inbox, server never told', async () => {
  const s = start();
  s.archive.restore();
  await tick();
  assert.equal(s.gate(), 'skipped');
  assert.equal(s.undos(), 1);
  s.archive.onSent(); // late signals change nothing
  s.archive.restore();
  await tick();
  assert.equal(s.undos(), 1);
});

test('a reminder the cache missed (another account): not archived after all', async () => {
  const s = start({ checkReminder: async () => true });
  s.archive.onSent();
  await tick();
  await tick();
  assert.equal(s.gate(), 'skipped');
  assert.equal(s.undos(), 1);
});

test("the scheduler can't say: the cache's answer stands", async () => {
  const s = start({ checkReminder: async () => null });
  s.archive.onSent();
  await tick();
  await tick();
  assert.equal(s.gate(), 'go');
});

test('once sent, a stray restore does not unarchive', async () => {
  const s = start();
  s.archive.onSent();
  s.archive.restore();
  await tick();
  assert.equal(s.gate(), 'go');
  assert.equal(s.undos(), 0);
});
