import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { highlightSearchTerms } from '@/main/models/message/parsePayloadPartWithHighlight';

// Highlighting runs after sanitization, so it must never turn escaped text back
// into live markup.

const { window } = new JSDOM('');
(globalThis as any).Node = window.Node;
(globalThis as any).DOMParser = window.DOMParser;

const parse = (html: string) => new JSDOM(`<body>${html}</body>`).window.document.body;

test('searchHighlight: escaped markup in text stays text', () => {
  const out = parse(highlightSearchTerms('<div>john &lt;img src=x&gt; wrote</div>', 'john'));
  assert.equal(out.querySelectorAll('img').length, 0);
  assert.equal(out.textContent, 'john <img src=x> wrote');
  assert.equal(out.querySelector('.mono-search-highlight')?.textContent, 'john');
});

test('searchHighlight: an address in angle brackets survives', () => {
  const out = parse(highlightSearchTerms('<div>John Smith &lt;john@example.com&gt; wrote:</div>', 'john'));
  assert.equal(out.textContent, 'John Smith <john@example.com> wrote:');
  assert.equal(out.querySelectorAll('.mono-search-highlight').length, 2);
});

test('searchHighlight: a later term never matches inside an earlier highlight', () => {
  const out = parse(highlightSearchTerms('<p>meeting class schedule</p>', 'meeting class'));
  assert.equal(out.textContent, 'meeting class schedule');
  const marks = Array.from(out.querySelectorAll('.mono-search-highlight'), (n) => n.textContent);
  assert.deepEqual(marks, ['meeting', 'class']);
});
