import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractAndRemoveEmailHistory, linkifyPlainText } from '@/main/models/message/utils';

// The reader folds quoted history behind "Show quoted text". A lone header
// label inside the message itself ("Date: Fri Oct 9", "To: All students") must
// not be mistaken for the start of a quoted reply.

const { window } = new JSDOM('');
(globalThis as any).Node = window.Node;

const split = (html: string) => {
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  const { cleanBody, history } = extractAndRemoveEmailHistory(body);
  return { visible: cleanBody.textContent ?? '', history: history.join('') };
};

test('emailHistory: a lone "Date:" line in an event email stays visible', () => {
  const { visible, history } = split(
    '<p>Hi team,</p><p>Date: Fri Oct 9</p><p>Location: Hodson Hall</p><p>See you there</p>'
  );
  assert.match(visible, /Location: Hodson Hall/);
  assert.match(visible, /See you there/);
  assert.equal(history, '');
});

test('emailHistory: a "To: All students" memo line stays visible', () => {
  const { visible, history } = split('<div>To: All students</div><div>Classes resume Monday.</div>');
  assert.match(visible, /Classes resume Monday/);
  assert.equal(history, '');
});

test('emailHistory: an Outlook reply header block (separate lines) is folded', () => {
  const { visible, history } = split(
    '<p>Sounds good.</p><p>From: Alice</p><p>Sent: Monday</p><p>To: Bob</p><p>Subject: Plan</p><p>Original body</p>'
  );
  assert.match(visible, /Sounds good/);
  assert.doesNotMatch(visible, /Original body/);
  assert.match(history, /Original body/);
});

test('emailHistory: an Outlook header block inside one <div> with <br> is folded', () => {
  const { visible, history } = split(
    '<p>Thanks!</p><div>From: Alice<br>Sent: Monday<br>Subject: Plan</div><p>Quoted text</p>'
  );
  assert.match(visible, /Thanks!/);
  assert.match(history, /Quoted text/);
});

test('emailHistory: "On … wrote:" still starts the history', () => {
  const { visible, history } = split(
    '<p>Yes.</p><p>On Mon, Oct 5, 2026 at 9:00 AM Alice wrote:</p><blockquote>earlier</blockquote>'
  );
  assert.match(visible, /Yes\./);
  assert.match(history, /earlier/);
});

// Plain-text bodies: URLs become links, everything else stays escaped text.

test('linkifyPlainText: a URL becomes a link, trailing punctuation stays outside', () => {
  const out = linkifyPlainText('Reset here: https://example.com/reset?a=1&b=2. Thanks');
  const doc = new JSDOM(`<body>${out}</body>`).window.document;
  const anchors = doc.querySelectorAll('a');
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].getAttribute('href'), 'https://example.com/reset?a=1&b=2');
  assert.equal(anchors[0].getAttribute('rel'), 'noopener noreferrer');
  assert.equal(doc.body.textContent, 'Reset here: https://example.com/reset?a=1&b=2. Thanks');
});

test('linkifyPlainText: markup in the text stays text and cannot break out of href', () => {
  const out = linkifyPlainText('<img src=x> see https://a.com/"onmouseover="x');
  const doc = new JSDOM(`<body>${out}</body>`).window.document;
  assert.equal(doc.querySelectorAll('img').length, 0);
  const anchor = doc.querySelector('a');
  assert.equal(anchor?.getAttribute('href'), 'https://a.com/');
  assert.equal(anchor?.getAttribute('onmouseover'), null);
});
