import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExpiringKeySet,
  NOTIFY_MAX_AGE_MS,
  RecentKeySet,
  SUMMARY_THRESHOLD,
  isFreshUnread,
  isPrimaryLabels,
  parseFrameLabels,
  passesNotificationPreference,
  planAlertSound,
  planBanners,
  summaryBannerText
} from '@/main/services/push/notificationPolicy';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

// ── parseFrameLabels ──────────────────────────────────────────────────────────

test('parseFrameLabels: parses the "[A, B]" frame string; tolerates empty/undefined', () => {
  assert.deepEqual(parseFrameLabels('[INBOX, UNREAD]'), ['INBOX', 'UNREAD']);
  assert.deepEqual(parseFrameLabels('[]'), []);
  assert.deepEqual(parseFrameLabels(undefined), []);
});

// ── isFreshUnread: backlog and read-state changes never notify ────────────────

test('isFreshUnread: unread mail received just now notifies', () => {
  assert.equal(isFreshUnread(['INBOX', 'UNREAD'], iso(30_000), NOW), true);
});

test('isFreshUnread: a read message (read elsewhere, flagged) never notifies', () => {
  assert.equal(isFreshUnread(['INBOX'], iso(30_000), NOW), false);
});

test('isFreshUnread: backlog older than the age limit does not notify', () => {
  assert.equal(isFreshUnread(['INBOX', 'UNREAD'], iso(NOTIFY_MAX_AGE_MS + 1), NOW), false);
  assert.equal(isFreshUnread(['INBOX', 'UNREAD'], iso(NOTIFY_MAX_AGE_MS), NOW), true);
  assert.equal(isFreshUnread(['INBOX', 'UNREAD'], iso(8 * 3_600_000), NOW), false);
});

test('isFreshUnread: frames without receivedAt (Gmail) skip the age check', () => {
  assert.equal(isFreshUnread(['INBOX', 'UNREAD'], undefined, NOW), true);
  assert.equal(isFreshUnread(['INBOX'], undefined, NOW), false);
});

test('isFreshUnread: an unparseable time does not drop a banner; a future time (clock skew) passes', () => {
  assert.equal(isFreshUnread(['UNREAD'], 'not a date', NOW), true);
  assert.equal(isFreshUnread(['UNREAD'], iso(-60_000), NOW), true);
});

// ── preference filter ─────────────────────────────────────────────────────────

test('passesNotificationPreference: OFF / ALL / default INBOX / a label', () => {
  const inbox = ['INBOX', 'UNREAD'];
  assert.equal(passesNotificationPreference(inbox, 'OFF'), false);
  assert.equal(passesNotificationPreference(['UNREAD'], 'ALL'), true);
  assert.equal(passesNotificationPreference(inbox, undefined), true); // unset = INBOX
  assert.equal(passesNotificationPreference(['UNREAD'], undefined), false);
  assert.equal(passesNotificationPreference(['Label_7', 'UNREAD'], 'Label_7'), true);
});

test('passesNotificationPreference: drafts and sent mail never notify', () => {
  assert.equal(passesNotificationPreference(['INBOX', 'DRAFT'], 'ALL'), false);
  assert.equal(passesNotificationPreference(['INBOX', 'SENT'], 'ALL'), false);
});

test('PRIMARY: no sender is filtered by name (the github.com rule is gone)', () => {
  // The filter only looks at labels; a Microsoft frame (INBOX, no CATEGORY_*)
  // from GitHub is Primary like any other.
  assert.equal(passesNotificationPreference(['INBOX', 'UNREAD'], 'PRIMARY'), true);
});

test('isPrimaryLabels: hidden categories follow the split preferences', () => {
  assert.equal(isPrimaryLabels(['INBOX', 'CATEGORY_SOCIAL']), false); // unset = hidden
  assert.equal(
    isPrimaryLabels(['INBOX', 'CATEGORY_SOCIAL'], {
      showSocial: true,
      showPromotions: false,
      showForums: false,
      showUpdates: false
    }),
    true
  );
  assert.equal(isPrimaryLabels(['INBOX', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL']), true);
  assert.equal(isPrimaryLabels(['CATEGORY_PERSONAL']), false); // not in the Inbox
});

// ── recently-notified bookkeeping ─────────────────────────────────────────────

test('RecentKeySet: remembers keys and evicts the oldest past the limit', () => {
  const set = new RecentKeySet(3);
  ['a', 'b', 'c'].forEach((k) => set.add(k));
  assert.equal(set.has('a'), true);
  set.add('a'); // refresh: 'b' is now the oldest
  set.add('d');
  assert.equal(set.size, 3);
  assert.equal(set.has('b'), false);
  assert.equal(set.has('a'), true);
  assert.equal(set.has('d'), true);
});

test('ExpiringKeySet: a key is present until its time to live runs out', () => {
  const set = new ExpiringKeySet();
  set.add('t', 1_000, 500);
  assert.equal(set.has('t', 1_200), true);
  assert.equal(set.has('t', 1_500), false);
  assert.equal(set.has('other', 1_000), false);
});

// ── burst collapse ────────────────────────────────────────────────────────────

test('planBanners: up to the threshold each message gets a banner; past it, one summary', () => {
  assert.equal(planBanners([]), null);
  const few = Array.from({ length: SUMMARY_THRESHOLD }, (_, i) => i);
  assert.deepEqual(planBanners(few), { kind: 'individual', items: few });
  const many = Array.from({ length: SUMMARY_THRESHOLD + 1 }, (_, i) => i);
  assert.equal(planBanners(many)?.kind, 'summary');
  // 468 replayed frames → still exactly one banner.
  assert.equal(planBanners(Array.from({ length: 468 }, (_, i) => i))?.kind, 'summary');
});

test('summaryBannerText: count in the title, de-duplicated senders in the body', () => {
  assert.deepEqual(summaryBannerText(4, ['Dana', 'Dana', 'Dana', 'Dana']), {
    title: '4 new emails',
    body: 'From Dana'
  });
  assert.equal(summaryBannerText(5, ['Dana', 'Alex', 'Dana']).body, 'From Dana and Alex');
  assert.equal(summaryBannerText(9, ['Dana', 'Alex', 'Sam']).body, 'From Dana, Alex and others');
  assert.equal(summaryBannerText(4, ['', ' ']).body, '');
});

// ── alert sound ───────────────────────────────────────────────────────────────

test('planAlertSound: Off silences everything', () => {
  assert.deepEqual(planAlertSound('Off', true), { silentNative: true, rendererSound: null });
  assert.deepEqual(planAlertSound('Off', false), { silentNative: true, rendererSound: null });
});

test('planAlertSound: with a window, the banner is silent and the chosen sound plays in the app', () => {
  assert.deepEqual(planAlertSound('Ping', true), { silentNative: true, rendererSound: 'Ping' });
  assert.deepEqual(planAlertSound(undefined, true), { silentNative: true, rendererSound: 'Mono' });
});

test('planAlertSound: with no window, fall back to the OS sound', () => {
  assert.deepEqual(planAlertSound('Ping', false), { silentNative: false, rendererSound: null });
});
