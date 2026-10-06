import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHistorySnippet, layoutConversation } from '@/renderer/app/lib/messageHistory';

test('cleanHistorySnippet cuts mobile signatures and the quoted reply header', () => {
  assert.equal(
    cleanHistorySnippet(
      'Thanks Kaitlyn! -R Sent from my Mobile On Thu, Sep 24, 2026 at 8:23 PM, Reneer, Kaitlyn <kaitlyn.re'
    ),
    'Thanks Kaitlyn! -R'
  );
  assert.equal(
    cleanHistorySnippet('Sounds good.  On 24 Sep 2026, at 10:01, Sam wrote: > hi'),
    'Sounds good.'
  );
  assert.equal(
    cleanHistorySnippet('Works for me On 9/24/26, Alex wrote: earlier'),
    'Works for me'
  );
});

test('cleanHistorySnippet cuts Outlook separators and header blocks', () => {
  assert.equal(
    cleanHistorySnippet('See attached. ________________________________ From: A Sent: Monday'),
    'See attached.'
  );
  assert.equal(
    cleanHistorySnippet('Approved. From: Jane Doe <jane@x.com> Sent: Monday, Oct 5 To: me'),
    'Approved.'
  );
  assert.equal(
    cleanHistorySnippet('FYI -----Original Message----- From: B'),
    'FYI'
  );
});

test('cleanHistorySnippet keeps ordinary text and falls back when nothing remains', () => {
  const plain = 'Hi Roushdy - I want to confirm that our team is still reviewing options.';
  assert.equal(cleanHistorySnippet(plain), plain);
  assert.equal(cleanHistorySnippet('On Monday we ship the patch.'), 'On Monday we ship the patch.');
  const forward = '---------- Forwarded message --------- From: X';
  assert.equal(cleanHistorySnippet(forward), forward);
  assert.equal(cleanHistorySnippet(null), '');
  assert.equal(cleanHistorySnippet('  a \n\n b  '), 'a b');
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);
const layout = (messages: string[], expanded: string[], unfold = false) =>
  layoutConversation(messages, (m) => !expanded.includes(m), (m) => m, unfold).map((e) =>
    e.kind === 'fold'
      ? `fold(${e.hidden.join(',')}):${e.stack}`
      : `${e.message}${e.collapsed ? `:${e.stack}` : ''}`
  );

test('layoutConversation stacks adjacent collapsed rows around expanded messages', () => {
  assert.deepEqual(layout(ids(4), ['m3']), ['m0:first', 'm1:middle', 'm2:last', 'm3']);
  assert.deepEqual(layout(ids(2), ['m1']), ['m0:single', 'm1']);
  assert.deepEqual(layout(ids(4), ['m1', 'm3']), ['m0:single', 'm1', 'm2:single', 'm3']);
  assert.deepEqual(layout(['m0'], ['m0']), ['m0']);
});

test('layoutConversation folds the middle of long collapsed runs', () => {
  assert.deepEqual(layout(ids(7), ['m6']), [
    'm0:first',
    'fold(m1,m2,m3):middle',
    'm4:middle',
    'm5:last',
    'm6'
  ]);
  // Four collapsed rows stay unfolded — folding would hide just one.
  assert.deepEqual(layout(ids(5), ['m4']), [
    'm0:first',
    'm1:middle',
    'm2:middle',
    'm3:last',
    'm4'
  ]);
  assert.deepEqual(layout(ids(7), ['m6'], true).length, 7);
});
