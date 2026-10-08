import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MICROSOFT_ATTACHMENT_BUDGET_BYTES,
  MICROSOFT_MAX_ENCODED_MIME,
  estimateMicrosoftRequestSize,
  formatLimit,
  measureHtmlBody
} from '@/renderer/app/lib/sendSizeLimits';

test('the Microsoft attachment budget fits under the encoded cap with room for a body', () => {
  const atBudget = estimateMicrosoftRequestSize({
    attachmentBytes: MICROSOFT_ATTACHMENT_BUDGET_BYTES
  });
  assert.ok(atBudget < MICROSOFT_MAX_ENCODED_MIME);
  // ~150 KB of HTML still fits alongside a full budget of attachments.
  assert.ok(
    estimateMicrosoftRequestSize({
      attachmentBytes: MICROSOFT_ATTACHMENT_BUDGET_BYTES,
      bodyBytes: 150 * 1024
    }) < MICROSOFT_MAX_ENCODED_MIME
  );
});

test('a 3 MB attachment is over the Microsoft cap (the provider would refuse it)', () => {
  assert.ok(
    estimateMicrosoftRequestSize({ attachmentBytes: 3 * 1024 * 1024 }) > MICROSOFT_MAX_ENCODED_MIME
  );
});

test('measureHtmlBody counts data: image base64 separately from the text', () => {
  const html = '<p>Hi</p><img src="data:image/png;base64,QUJDRA=="><p>Bye</p>';
  const { bodyBytes, inlineImageBase64Chars } = measureHtmlBody(html);
  assert.equal(inlineImageBase64Chars, 'QUJDRA=='.length);
  assert.equal(bodyBytes, '<p>Hi</p><img src=""><p>Bye</p>'.length);
});

test('formatLimit reads as a person would say it', () => {
  assert.equal(formatLimit(2 * 1024 * 1024), '2 MB');
  assert.equal(formatLimit(25 * 1024 * 1024), '25 MB');
  assert.equal(formatLimit(512 * 1024), '512 KB');
});
