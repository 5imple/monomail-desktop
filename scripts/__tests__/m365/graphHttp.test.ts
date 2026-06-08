import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraphUrl,
  withImmutableIdPrefer,
  sanitizeMethod,
  sanitizeHeaders,
  parseRetryAfterMs,
  chunk,
  getErrorMessage,
  MAX_RETRY_AFTER_MS
} from '@/main/services/ipc-handlers/graph/graphHttp';

// ── buildGraphUrl — security-critical origin validation ──────────────────────

test('buildGraphUrl: relative paths resolve against the v1.0 base', () => {
  assert.equal(buildGraphUrl('/me/messages/1'), 'https://graph.microsoft.com/v1.0/me/messages/1');
  assert.equal(buildGraphUrl('/me/mailFolders/inbox/messages'), 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
});

test('buildGraphUrl: opaque absolute Graph delta links pass through', () => {
  const delta = 'https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=ABC123';
  assert.equal(buildGraphUrl(delta), delta);
});

test('buildGraphUrl: rejects non-Graph hosts (SSRF guard)', () => {
  assert.equal(buildGraphUrl('https://evil.com/v1.0/me/messages'), null);
  assert.equal(buildGraphUrl('https://graph.microsoft.com.evil.com/x'), null);
  assert.equal(buildGraphUrl('https://notgraph.microsoft.com/x'), null);
  assert.equal(buildGraphUrl('https://attacker.example/graph.microsoft.com'), null);
});

test('buildGraphUrl: rejects the userinfo/credential host-spoof trick', () => {
  // The host is evil.com here; graph.microsoft.com is only userinfo before the @.
  assert.equal(buildGraphUrl('https://graph.microsoft.com@evil.com/v1.0/me'), null);
  assert.equal(buildGraphUrl('https://user:pass@evil.com/x'), null);
});

test('buildGraphUrl: rejects non-https and malformed inputs', () => {
  assert.equal(buildGraphUrl('http://graph.microsoft.com/x'), null);
  assert.equal(buildGraphUrl('//evil.com/x'), null);
  assert.equal(buildGraphUrl('/me/messages\r\nHost: evil'), null); // CRLF injection
  assert.equal(buildGraphUrl('me/messages'), null); // no leading slash
  assert.equal(buildGraphUrl(''), null);
  assert.equal(buildGraphUrl(undefined), null);
  assert.equal(buildGraphUrl(42), null);
});

// ── withImmutableIdPrefer — A1: present on EVERY request ──────────────────────

test('withImmutableIdPrefer: adds the header when absent', () => {
  assert.deepEqual(withImmutableIdPrefer({}), { Prefer: 'IdType="ImmutableId"' });
  assert.deepEqual(withImmutableIdPrefer({ Accept: 'application/json' }), {
    Accept: 'application/json',
    Prefer: 'IdType="ImmutableId"'
  });
});

test('withImmutableIdPrefer: appends to an existing Prefer, preserving it', () => {
  const out = withImmutableIdPrefer({ Prefer: 'odata.maxpagesize=50' });
  assert.equal(out.Prefer, 'odata.maxpagesize=50, IdType="ImmutableId"');
});

test('withImmutableIdPrefer: does not duplicate when IdType already present', () => {
  const headers = { Prefer: 'IdType="ImmutableId"' };
  assert.deepEqual(withImmutableIdPrefer(headers), headers);
  const mixed = { Prefer: 'odata.maxpagesize=10, IdType="ImmutableId"' };
  assert.deepEqual(withImmutableIdPrefer(mixed), mixed);
});

test('withImmutableIdPrefer: merges into a lowercased prefer key', () => {
  const out = withImmutableIdPrefer({ prefer: 'odata.maxpagesize=50' });
  assert.equal(out.prefer, 'odata.maxpagesize=50, IdType="ImmutableId"');
  assert.equal(out.Prefer, undefined); // didn't create a second key
});

// ── sanitizeMethod / sanitizeHeaders ─────────────────────────────────────────

test('sanitizeMethod: normalizes allowed verbs, rejects the rest', () => {
  assert.equal(sanitizeMethod('get'), 'GET');
  assert.equal(sanitizeMethod('PATCH'), 'PATCH');
  assert.equal(sanitizeMethod('TRACE'), null);
  assert.equal(sanitizeMethod(undefined), null);
});

test('sanitizeHeaders: forwards only the allow-listed headers, drops Authorization', () => {
  const out = sanitizeHeaders({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'odata.maxpagesize=10',
    ConsistencyLevel: 'eventual',
    Authorization: 'Bearer leak',
    'X-Evil': 'nope',
    Bad: 123
  });
  assert.deepEqual(out, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'odata.maxpagesize=10',
    ConsistencyLevel: 'eventual'
  });
  assert.deepEqual(sanitizeHeaders(undefined), {});
});

// ── parseRetryAfterMs / chunk — $batch throttling helpers ────────────────────

test('parseRetryAfterMs: seconds → ms, capped, robust to junk', () => {
  assert.equal(parseRetryAfterMs({ 'Retry-After': '5' }), 5000);
  assert.equal(parseRetryAfterMs({ 'retry-after': '2' }), 2000); // case-insensitive
  assert.equal(parseRetryAfterMs({}), 0);
  assert.equal(parseRetryAfterMs(undefined), 0);
  assert.equal(parseRetryAfterMs({ 'Retry-After': 'soon' }), 0);
  assert.equal(parseRetryAfterMs({ 'Retry-After': '-3' }), 0);
  assert.equal(parseRetryAfterMs({ 'Retry-After': '99999' }), MAX_RETRY_AFTER_MS); // capped
});

test('parseRetryAfterMs: accepts the RFC 7231 HTTP-date form', () => {
  // Far-future date → positive delta, capped at the max.
  assert.equal(parseRetryAfterMs({ 'Retry-After': 'Wed, 21 Oct 2099 07:28:00 GMT' }), MAX_RETRY_AFTER_MS);
  // Past date → no wait.
  assert.equal(parseRetryAfterMs({ 'Retry-After': 'Wed, 21 Oct 2000 07:28:00 GMT' }), 0);
  // Near-future date → the actual when-minus-now delta (NOT the cap), proving the
  // arithmetic, not just the ceiling. ~10s, comfortably under the 60s cap.
  const near = new Date(Date.now() + 10_000).toUTCString();
  const ms = parseRetryAfterMs({ 'Retry-After': near });
  assert.ok(ms > 5_000 && ms <= 10_000, `expected ~10s delta, got ${ms}`);
});

test('getErrorMessage: extracts string / nested message, falls back to status', () => {
  assert.equal(getErrorMessage(400, { error: 'bad request' }), 'bad request');
  assert.equal(getErrorMessage(404, { error: { message: 'not found' } }), 'not found');
  assert.equal(getErrorMessage(500, null), 'Graph request failed (500)');
  assert.equal(getErrorMessage(503, 'plain string body'), 'Graph request failed (503)');
});

test('chunk: splits into groups of at most size (Graph $batch cap = 20)', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  const groups = chunk(items, 20);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g) => g.length), [20, 20, 5]);
  assert.deepEqual(chunk([], 20), []);
  assert.deepEqual(chunk([1], 20), [[1]]);
});
