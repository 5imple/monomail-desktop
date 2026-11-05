import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MonoThread } from '@/main/models/thread/MonoThread';
import {
  isRuleComplete,
  sameFilters,
  threadMatchesFilters
} from '@/renderer/app/lib/threadFilters';
import type { FilterCriteria } from '@/renderer/app/types';

// The rules behind the list filters and custom labels (lib/threadFilters).

function thread(over: Partial<Record<keyof MonoThread, unknown>> = {}): MonoThread {
  return {
    id: 't1',
    accountId: 'a1',
    subject: 'Budget review for spring',
    from: [{ email: 'alice@washcoll.edu', name: 'Alice Smith' }],
    to: [{ email: 'me@washcoll.edu', name: 'Me' }],
    cc: [{ email: 'registrar@washcoll.edu', name: 'Registrar' }],
    bcc: [],
    labelIds: ['INBOX', 'UNREAD'],
    attachments: {},
    items: [],
    timestamp: Date.parse('2026-11-04T10:00:00'),
    ...over
  } as unknown as MonoThread;
}

const noLabels = () => [];
const now = new Date('2026-11-04T12:00:00');
const match = (t: MonoThread, rules: FilterCriteria[], labels = noLabels) =>
  threadMatchesFilters(t, rules, labels, now);

test('from: name, email or domain, case-insensitive', () => {
  assert.equal(match(thread(), [{ type: 'from', operator: 'contains', value: 'ALICE' }]), true);
  assert.equal(
    match(thread(), [{ type: 'from', operator: 'contains', value: '@washcoll.edu' }]),
    true
  );
  assert.equal(match(thread(), [{ type: 'from', operator: 'contains', value: 'bob' }]), false);
  assert.equal(
    match(thread(), [{ type: 'from', operator: 'does_not_contain', value: 'alice' }]),
    false
  );
});

test('sent to covers To and Cc', () => {
  assert.equal(match(thread(), [{ type: 'to', operator: 'contains', value: 'me@' }]), true);
  assert.equal(match(thread(), [{ type: 'to', operator: 'contains', value: 'registrar' }]), true);
  assert.equal(match(thread(), [{ type: 'to', operator: 'contains', value: 'dean' }]), false);
});

test('two values for one field: either for contains, neither for does-not-contain', () => {
  const either: FilterCriteria[] = [
    { type: 'from', operator: 'contains', value: 'bob' },
    { type: 'from', operator: 'contains', value: 'alice' }
  ];
  assert.equal(match(thread(), either), true);
  const neither: FilterCriteria[] = [
    { type: 'from', operator: 'does_not_contain', value: 'bob' },
    { type: 'from', operator: 'does_not_contain', value: 'alice' }
  ];
  // Was "either" before: excluding alice OR bob let alice through.
  assert.equal(match(thread(), neither), false);
  assert.equal(match(thread({ from: [{ email: 'carol@x.org' }] }), neither), true);
});

test('different fields must all match', () => {
  const rules: FilterCriteria[] = [
    { type: 'from', operator: 'contains', value: 'alice' },
    { type: 'subject', operator: 'contains', value: 'budget' },
    { type: 'read_status', operator: 'is', value: 'unread' }
  ];
  assert.equal(match(thread(), rules), true);
  assert.equal(match(thread({ labelIds: ['INBOX'] }), rules), false);
  assert.equal(match(thread({ subject: 'Lunch' }), rules), false);
});

test('attachments, read state, date', () => {
  const withFile = thread({ attachments: { x: {} } });
  assert.equal(match(withFile, [{ type: 'attachment', operator: 'has' }]), true);
  assert.equal(match(thread(), [{ type: 'attachment', operator: 'has' }]), false);
  assert.equal(match(thread(), [{ type: 'attachment', operator: 'does_not_have' }]), true);
  assert.equal(match(thread(), [{ type: 'read_status', operator: 'is', value: 'read' }]), false);
  assert.equal(match(thread(), [{ type: 'date', operator: 'is', value: 'today' }]), true);
  const lastMonth = thread({ timestamp: Date.parse('2026-10-20T10:00:00') });
  assert.equal(match(lastMonth, [{ type: 'date', operator: 'is', value: 'this_month' }]), false);
});

test('label rules match by label name across accounts', () => {
  const labels = (name: string) => (name === 'Advising' ? ['L1', 'L2'] : []);
  const rule: FilterCriteria = { type: 'label', operator: 'contains', value: 'Advising' };
  assert.equal(match(thread({ labelIds: ['INBOX', 'L2'] }), [rule], labels), true);
  assert.equal(match(thread(), [rule], labels), false);
});

test('an empty text rule is ignored, not "matches nothing"', () => {
  assert.equal(isRuleComplete({ type: 'from', operator: 'contains', value: '  ' }), false);
  assert.equal(isRuleComplete({ type: 'attachment', operator: 'has' }), true);
  assert.equal(match(thread(), [{ type: 'from', operator: 'contains', value: '' }]), true);
});

test('sameFilters ignores order, case and spaces (which tab is showing)', () => {
  const a: FilterCriteria[] = [
    { type: 'from', operator: 'contains', value: 'Alice' },
    { type: 'attachment', operator: 'has' }
  ];
  const b: FilterCriteria[] = [
    { type: 'attachment', operator: 'has' },
    { type: 'from', operator: 'contains', value: ' alice ' }
  ];
  assert.equal(sameFilters(a, b), true);
  assert.equal(sameFilters(a, a.slice(0, 1)), false);
  assert.equal(
    sameFilters(a, [{ type: 'from', operator: 'does_not_contain', value: 'alice' }, a[1]]),
    false
  );
});

test('Focused Inbox: Other only when no message in the conversation is Focused', async () => {
  const { isOtherThread } = await import('@/renderer/app/lib/threadFilters');
  const other: FilterCriteria[] = [{ type: 'inbox_type', operator: 'is', value: 'other' }];
  const focused: FilterCriteria[] = [{ type: 'inbox_type', operator: 'is', value: 'focused' }];
  const newsletter = thread({ labelIds: ['INBOX', 'inference:other'] });
  const mixed = thread({ labelIds: ['INBOX', 'inference:other', 'inference:focused'] });
  assert.equal(match(newsletter, other), true);
  assert.equal(match(newsletter, focused), false);
  assert.equal(match(mixed, other), false);
  assert.equal(match(mixed, focused), true);
  // Gmail has no Focused Inbox: its Promotions / Social / … tabs are Other.
  assert.equal(isOtherThread(['INBOX', 'CATEGORY_PROMOTIONS']), true);
  assert.equal(isOtherThread(['INBOX', 'CATEGORY_PERSONAL']), false);
  // Not yet known (cached before the field was fetched): not Other.
  assert.equal(match(thread(), other), false);
});

test("Graph's inferenceClassification becomes a label", async () => {
  const { mapGraphMessageLabels } = await import('@/main/api/mail/graphTransforms');
  assert.ok(
    mapGraphMessageLabels({ id: 'm', inferenceClassification: 'other' }, 'INBOX').includes(
      'inference:other'
    )
  );
  assert.ok(
    mapGraphMessageLabels({ id: 'm', inferenceClassification: 'focused' }, 'INBOX').includes(
      'inference:focused'
    )
  );
  assert.equal(
    mapGraphMessageLabels({ id: 'm' }, 'INBOX').some((l) => l.startsWith('inference:')),
    false
  );
});

test('Focused/Other only from Inbox copies (a Sent reply does not vote)', async () => {
  const { mapGraphMessageLabels } = await import('@/main/api/mail/graphTransforms');
  const sent = mapGraphMessageLabels({ id: 's', inferenceClassification: 'focused' }, 'SENT');
  assert.equal(
    sent.some((l) => l.startsWith('inference:')),
    false
  );
});

test('delta frames carry Focused/Other for Inbox messages', async () => {
  const { synthesizeDeltaFrames } = await import('@/main/services/push/mailDeltaFrames');
  const [read, unread] = synthesizeDeltaFrames(
    'microsoft:x',
    'inbox',
    [
      { id: 'm1', isRead: true, inferenceClassification: 'other' },
      { id: 'm2', isRead: false, inferenceClassification: 'focused' }
    ],
    []
  );
  assert.equal(read.data?.labels, '[INBOX, inference:other]');
  assert.equal(unread.data?.labels, '[INBOX, UNREAD, inference:focused]');
  // The shared folder label list isn't changed by one frame.
  const [again] = synthesizeDeltaFrames('microsoft:x', 'inbox', [{ id: 'm3', isRead: true }], []);
  assert.equal(again.data?.labels, '[INBOX]');
});

test('"Only show here" labels: what they match leaves the Inbox tabs', async () => {
  const { hiddenBySplitLabel } = await import('@/renderer/app/lib/threadFilters');
  const others = [
    { rules: [{ type: 'inbox_type', operator: 'is', value: 'other' }] as FilterCriteria[] }
  ];
  const adobe = thread({ labelIds: ['INBOX', 'inference:other'] });
  const dean = thread({ labelIds: ['INBOX', 'inference:focused'] });
  assert.equal(hiddenBySplitLabel(adobe, others, noLabels, now), true);
  assert.equal(hiddenBySplitLabel(dean, others, noLabels, now), false);
  // Not yet classified (cached before the field was fetched): stays in All.
  assert.equal(hiddenBySplitLabel(thread(), others, noLabels, now), false);
  // A label with no usable rule would match everything: it hides nothing.
  const empty = [
    { rules: [{ type: 'from', operator: 'contains', value: ' ' }] as FilterCriteria[] }
  ];
  assert.equal(hiddenBySplitLabel(adobe, empty, noLabels, now), false);
  assert.equal(hiddenBySplitLabel(adobe, [], noLabels, now), false);
});

test('count beside a tab: every conversation the tab shows', async () => {
  const { countForTab, splitLabelsFor } = await import('@/renderer/app/lib/threadFilters');
  const othersRules: FilterCriteria[] = [{ type: 'inbox_type', operator: 'is', value: 'other' }];
  const labels = [
    { id: 'o', rules: othersRules, hideFromInbox: true },
    { id: 'm', rules: [{ type: 'to', operator: 'contains', value: 'me@' }] as FilterCriteria[] }
  ];
  const threads = [
    thread({ id: 'a', labelIds: ['INBOX', 'UNREAD', 'inference:other'] }),
    thread({ id: 'b', labelIds: ['INBOX', 'UNREAD', 'inference:focused'] }),
    thread({ id: 'c', labelIds: ['INBOX', 'inference:focused'] })
  ];
  const countFor = (rules: FilterCriteria[], inInbox = true) =>
    countForTab(threads, rules, splitLabelsFor(rules, labels, inInbox), noLabels, now);
  // Read and unread alike; All and "to me" leave out what Others claims.
  assert.equal(countFor([]), 2);
  assert.equal(countFor(labels[1].rules), 2);
  assert.equal(countFor(othersRules), 1);
  assert.equal(countFor([{ type: 'read_status', operator: 'is', value: 'unread' }]), 1);
  // Outside the Inbox nothing is split off.
  assert.equal(countFor([], false), 3);
});

test('team: someone else at the domain; your own messages and personal domains do not count', async () => {
  const { setOwnAddresses, teamDomainsFor } = await import('@/renderer/app/lib/threadFilters');
  setOwnAddresses(['me@washcoll.edu']);
  const team: FilterCriteria[] = [{ type: 'team', operator: 'is', value: 'washcoll.edu' }];
  // Alice writes from the domain.
  assert.equal(match(thread(), team), true);
  // A subdomain is the same organisation.
  assert.equal(
    match(thread({ from: [{ email: 'dean@students.washcoll.edu' }] }), team),
    true
  );
  // Only you, replying to an outside sender: not team mail.
  assert.equal(
    match(thread({ from: [{ email: 'vendor@acme.com' }, { email: 'ME@washcoll.edu' }] }), team),
    false
  );
  // A look-alike domain doesn't match.
  assert.equal(match(thread({ from: [{ email: 'x@notwashcoll.edu' }] }), team), false);
  setOwnAddresses([]);

  assert.deepEqual(teamDomainsFor(['me@washcoll.edu', 'me@gmail.com', 'Me@WashColl.edu']), [
    'washcoll.edu'
  ]);
  assert.deepEqual(teamDomainsFor(['me@outlook.com']), []);
});

test('two splits match one conversation: the one earlier in the tab order keeps it', async () => {
  const { countForTab, splitLabelsFor, unreadCountForTab } = await import(
    '@/renderer/app/lib/threadFilters'
  );
  const othersRules: FilterCriteria[] = [{ type: 'inbox_type', operator: 'is', value: 'other' }];
  const teamRules: FilterCriteria[] = [{ type: 'team', operator: 'is', value: 'washcoll.edu' }];
  const labels = [
    { id: 'others', rules: othersRules, hideFromInbox: true },
    { id: 'team', rules: teamRules, hideFromInbox: true }
  ];
  // A colleague's mail that Outlook filed as Other.
  const both = thread({ id: 'a', labelIds: ['INBOX', 'UNREAD', 'inference:other'] });
  const countFor = (rules: FilterCriteria[], order: string[]) =>
    countForTab([both], rules, splitLabelsFor(rules, labels, true, order), noLabels, now);

  // Others first: Others keeps it, Team and All don't show it.
  assert.equal(countFor(othersRules, ['all', 'others', 'team']), 1);
  assert.equal(countFor(teamRules, ['all', 'others', 'team']), 0);
  assert.equal(countFor([], ['all', 'others', 'team']), 0);
  // Team dragged before Others: Team keeps it.
  assert.equal(countFor(teamRules, ['all', 'team', 'others']), 1);
  assert.equal(countFor(othersRules, ['all', 'team', 'others']), 0);

  // The number beside a tab counts unread conversations only.
  const read = thread({ id: 'b', labelIds: ['INBOX', 'inference:focused'] });
  assert.equal(unreadCountForTab([both, read], [], [], noLabels, now), 1);
});

test('split colours: the first unused, kept once given', async () => {
  const { nextSplitColor, withSplitColors } = await import('@/renderer/app/lib/splitColors');
  assert.equal(nextSplitColor([]), 'violet');
  assert.equal(nextSplitColor([{ color: 'violet' }]), 'teal');
  const coloured = withSplitColors([{ name: 'a' }, { name: 'b', color: 'violet' }, { name: 'c' }]);
  assert.deepEqual(
    coloured.map((l) => l.color),
    ['teal', 'violet', 'amber']
  );
  const same = [{ color: 'rose' as const }];
  assert.equal(withSplitColors(same), same);
});
