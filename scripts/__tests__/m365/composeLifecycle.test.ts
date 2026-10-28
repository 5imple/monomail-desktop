import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import {
  closeOutcome,
  editableSnapshot,
  escapeClosesCompose,
  findUnfilledVariables,
  signatureKind,
  toggleReplyAll
} from '@/renderer/app/components/card/compose/composeLifecycle';
import { convertPlainTextToHtml } from '@/renderer/app/lib/text-editor/convertPlainTextToHtml';

// Closing compose (Esc, Back, X) never asks: edits are saved, an untouched
// new compose goes away, and a saved draft is never deleted on a guess.
test('closeOutcome saves edits, removes only a confirmed-new untouched draft', () => {
  assert.equal(closeOutcome(false, true), 'save');
  assert.equal(closeOutcome(false, false), 'save');
  assert.equal(closeOutcome(false, null), 'save');
  assert.equal(closeOutcome(true, false), 'remove-empty');
  assert.equal(closeOutcome(true, true), 'keep');
  // Saved-draft lookup not answered yet: treated as saved.
  assert.equal(closeOutcome(true, null), 'keep');
});

test('editableSnapshot ignores what changes on its own', () => {
  const draft = new MonoDraft({
    from: 'me@x.com',
    to: ['a@x.com'],
    subject: 'Hi',
    body: '<p>x</p>'
  });
  const before = editableSnapshot(draft);
  const later = new MonoDraft(draft.toPlainObject());
  later.signatureId = 'sig-1';
  later.threadId = 'thread-1';
  later.timestamp = draft.timestamp + 5000;
  assert.equal(editableSnapshot(later), before);
  later.update({ body: '<p>x</p><p></p>' });
  assert.equal(editableSnapshot(later), before);
  later.update({ body: '<p>xy</p>' });
  assert.notEqual(editableSnapshot(later), before);
});

test('Escape closes compose only when nothing else took it', () => {
  const emptyDoc = { querySelector: () => null };
  const withDialog = { querySelector: () => ({}) as Element };
  assert.equal(
    escapeClosesCompose({ defaultPrevented: false, isComposing: false }, emptyDoc),
    true
  );
  // The slash menu / link / variable popovers preventDefault their Escape.
  assert.equal(
    escapeClosesCompose({ defaultPrevented: true, isComposing: false }, emptyDoc),
    false
  );
  // Ending an IME composition.
  assert.equal(
    escapeClosesCompose({ defaultPrevented: false, isComposing: true }, emptyDoc),
    false
  );
  // A dialog or menu open over compose.
  assert.equal(
    escapeClosesCompose({ defaultPrevented: false, isComposing: false }, withDialog),
    false
  );
});

test('findUnfilledVariables lists each {variable} once', () => {
  assert.deepEqual(findUnfilledVariables('Hi {first_name}, about {Company} — {first_name}'), [
    '{first_name}',
    '{Company}'
  ]);
  assert.deepEqual(findUnfilledVariables('Hi Ana, all filled in.'), []);
  assert.deepEqual(findUnfilledVariables('{ }'), []);
  assert.deepEqual(findUnfilledVariables(''), []);
});

test('signatureKind matches the signature switcher', () => {
  assert.equal(signatureKind('Fwd: Budget', 'm1'), 'forward');
  assert.equal(signatureKind('FW: Budget', 'm1'), 'forward');
  assert.equal(signatureKind('Re: Budget', ''), 'reply');
  assert.equal(signatureKind('Budget', 'm1'), 'reply');
  assert.equal(signatureKind('Budget', ''), 'new');
});

test('toggleReplyAll adds the missing people, then goes back to the sender', () => {
  const everyone = { to: ['boss@x.com', 'b@x.com'], cc: ['c@x.com'] };
  const added = toggleReplyAll({ to: ['boss@x.com'], cc: [] }, everyone, 'boss@x.com');
  assert.equal(added.mode, 'add');
  assert.equal(added.missing, 2);
  assert.deepEqual(added.to, ['boss@x.com', 'b@x.com']);
  assert.deepEqual(added.cc, ['c@x.com']);

  const back = toggleReplyAll({ to: added.to, cc: added.cc }, everyone, 'boss@x.com');
  assert.equal(back.mode, 'remove');
  assert.deepEqual(back.to, ['boss@x.com']);
  assert.deepEqual(back.cc, []);
});

test('toggleReplyAll keeps recipients the user added and compares case-insensitively', () => {
  const everyone = { to: ['Boss@X.com', 'b@x.com'], cc: [] };
  const state = toggleReplyAll(
    { to: ['boss@x.com', 'B@x.com', 'mine@y.com'], cc: [] },
    everyone,
    'boss@x.com'
  );
  assert.equal(state.mode, 'remove');
  assert.deepEqual(state.to, ['boss@x.com', 'mine@y.com']);
});

test('convertPlainTextToHtml keeps HTML and paragraphs plain text', () => {
  assert.equal(convertPlainTextToHtml('<p>hi</p>'), '<p>hi</p>');
  assert.equal(convertPlainTextToHtml('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  assert.equal(convertPlainTextToHtml(''), '<p></p>');
});
