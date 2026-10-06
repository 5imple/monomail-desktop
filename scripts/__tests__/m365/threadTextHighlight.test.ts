import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';

// Subjects/snippets are mounted with dangerouslySetInnerHTML, so the output
// must be escaped HTML with highlight spans only around real matches.

const strip = (html: string) =>
  html
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

test('threadTextHighlight: a later term never matches inside an earlier highlight', () => {
  const out = highlightThreadText('Class schedule for the text', 'schedule class text');
  assert.equal(strip(out), 'Class schedule for the text');
  assert.equal((out.match(/<span /g) ?? []).length, 3);
  assert.doesNotMatch(out, /rounded-sm select-text">[^<]*rounded/);
});

test('threadTextHighlight: entities are never split by a term like "amp"', () => {
  const out = highlightThreadText('Tom &amp; Jerry camp', 'amp');
  assert.equal(strip(out), 'Tom & Jerry camp');
  assert.match(out, /Tom &amp; Jerry c<span[^>]*>amp<\/span>/);
});

test('threadTextHighlight: subjects stay escaped with and without a query', () => {
  const evil = '<img src=x onerror=alert(1)> invoice';
  for (const query of ['', 'invoice']) {
    const out = highlightThreadText(evil, query);
    assert.doesNotMatch(out, /<img/);
    assert.equal(strip(out), evil);
  }
});
