import type { MonoMessage } from '@/main/models/message/MonoMessage';
import type { MonoThread } from '@/main/models/thread/MonoThread';
import { isCalendarAttachment } from '@/renderer/app/lib/icsParser';
import { threadHasFileAttachments } from '@/renderer/app/lib/threadAttachments';
import type { FilterCriteria } from '@/renderer/app/types';

/**
 * The list filter rules, shared by the filter menu, the quick tabs and the
 * custom labels.
 *
 * A thread must match every field that has a rule (AND). Several "contains"
 * rules on the same field mean either one (From alice OR From bob); several
 * "does not contain" rules mean none of them (not alice AND not bob).
 */

type Recipient = { email?: string; name?: string };

const NEGATIVE_OPERATORS = new Set<FilterCriteria['operator']>([
  'does_not_contain',
  'does_not_have',
  'is_not'
]);

function anyRecipientMatches(recipients: Recipient[] | undefined, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  return (recipients ?? []).some(
    (r) => (r.email ?? '').toLowerCase().includes(n) || (r.name ?? '').toLowerCase().includes(n)
  );
}

function threadHasCalendarInvite(thread: MonoThread): boolean {
  return thread.items.some(
    (item) =>
      item.type === 'message' &&
      Object.values((item as MonoMessage).attachments ?? {}).some((a) => isCalendarAttachment(a))
  );
}

function isWithinDate(timestamp: number, value: string | undefined, now: Date): boolean {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  switch (value) {
    case 'today':
      return date >= today;
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return date >= yesterday && date < today;
    }
    case 'this_week': {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return date >= weekStart;
    }
    case 'this_month':
      return date >= new Date(today.getFullYear(), today.getMonth(), 1);
    default:
      return true;
  }
}

// Gmail's tabs for mail that isn't personal: they count as "Other".
const GMAIL_OTHER_CATEGORIES = [
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
];

/**
 * Focused Inbox: Outlook sorts each message into Focused or Other
 * (inference:focused / inference:other). A conversation is Other only when
 * none of its messages is Focused. Gmail has no Focused Inbox; its
 * Promotions / Social / Updates / Forums tabs count as Other.
 */
export function isOtherThread(labelIds: string[]): boolean {
  if (labelIds.includes('inference:focused')) return false;
  if (labelIds.includes('inference:other')) return true;
  return labelIds.some((l) => GMAIL_OTHER_CATEGORIES.includes(l));
}

// The connected accounts' own addresses (AuthContext keeps them current). A
// Team rule looks at who else wrote in the conversation: your own reply to an
// outside sender doesn't make it team mail.
let ownAddresses = new Set<string>();
export function setOwnAddresses(emails: string[]): void {
  ownAddresses = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

const domainOf = (email: string) => {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
};

/** Team: someone other than you, writing from this domain (or a subdomain of it). */
function sentByTeam(thread: MonoThread, domainValue: string): boolean {
  const domain = domainValue.trim().toLowerCase().replace(/^@/, '');
  if (!domain) return false;
  return (thread.from ?? []).some((r) => {
    const email = (r.email ?? '').trim().toLowerCase();
    if (!email || ownAddresses.has(email)) return false;
    const senderDomain = domainOf(email);
    return senderDomain === domain || senderDomain.endsWith(`.${domain}`);
  });
}

// Personal mail providers: everyone on gmail.com is not a team.
const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'zoho.com',
  'yandex.com',
  'mail.com'
]);

/** The work domains among the connected accounts, for the automatic Team split. */
export function teamDomainsFor(emails: string[]): string[] {
  const domains = new Set<string>();
  for (const email of emails) {
    const domain = domainOf(email.trim().toLowerCase());
    if (domain && !PERSONAL_MAIL_DOMAINS.has(domain)) domains.add(domain);
  }
  return [...domains];
}

/** Whether the thread passes one rule, read positively ("does not contain x" → contains x). */
function matchesPositively(
  thread: MonoThread,
  rule: FilterCriteria,
  labelIdsByName: (name: string) => string[],
  now: Date
): boolean {
  const value = rule.value ?? '';
  switch (rule.type) {
    case 'read_status':
      return value === 'read'
        ? !thread.labelIds.includes('UNREAD')
        : thread.labelIds.includes('UNREAD');
    case 'attachment':
      return threadHasFileAttachments(thread);
    case 'calendar':
      return threadHasCalendarInvite(thread);
    case 'label': {
      const ids = labelIdsByName(value);
      return ids.length > 0 && thread.labelIds.some((id) => ids.includes(id));
    }
    case 'from':
      return anyRecipientMatches(thread.from, value);
    // "Sent to" is anyone the mail went to, Cc included (as Gmail's to: does).
    case 'to':
      return anyRecipientMatches([...thread.to, ...thread.cc, ...thread.bcc], value);
    case 'cc':
      return anyRecipientMatches(thread.cc, value);
    case 'bcc':
      return anyRecipientMatches(thread.bcc, value);
    case 'subject':
      return !!value.trim() && thread.subject.toLowerCase().includes(value.trim().toLowerCase());
    case 'date':
      return isWithinDate(thread.timestamp, value, now);
    case 'inbox_type':
      return value === 'other' ? isOtherThread(thread.labelIds) : !isOtherThread(thread.labelIds);
    case 'team':
      return sentByTeam(thread, value);
    default:
      return true;
  }
}

/** A rule that can't decide anything yet (an empty text box) is left out. */
export function isRuleComplete(rule: FilterCriteria): boolean {
  switch (rule.type) {
    case 'attachment':
    case 'calendar':
      return true;
    default:
      return !!rule.value?.trim();
  }
}

export function threadMatchesFilters(
  thread: MonoThread,
  filters: FilterCriteria[],
  labelIdsByName: (name: string) => string[],
  now: Date = new Date()
): boolean {
  let rules = filters.filter(isRuleComplete);
  // Read and unread together cancel out.
  const readValues = new Set(
    rules.filter((r) => r.type === 'read_status' && r.operator === 'is').map((r) => r.value)
  );
  if (readValues.has('read') && readValues.has('unread')) {
    rules = rules.filter((r) => r.type !== 'read_status');
  }
  if (rules.length === 0) return true;

  const byField = new Map<string, FilterCriteria[]>();
  for (const rule of rules) {
    const list = byField.get(rule.type) ?? [];
    list.push(rule);
    byField.set(rule.type, list);
  }

  for (const fieldRules of byField.values()) {
    const include = fieldRules.filter((r) => !NEGATIVE_OPERATORS.has(r.operator));
    const exclude = fieldRules.filter((r) => NEGATIVE_OPERATORS.has(r.operator));
    if (
      include.length > 0 &&
      !include.some((r) => matchesPositively(thread, r, labelIdsByName, now))
    )
      return false;
    if (exclude.some((r) => matchesPositively(thread, r, labelIdsByName, now))) return false;
  }
  return true;
}

function ruleKey(rule: FilterCriteria): string {
  return `${rule.type}|${rule.operator}|${(rule.value ?? '').trim().toLowerCase()}`;
}

/** Same rules, in any order: tells which tab the current filters belong to. */
export function sameFilters(a: FilterCriteria[], b: FilterCriteria[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(ruleKey).sort();
  const right = b.map(ruleKey).sort();
  return left.every((key, i) => key === right[i]);
}

/**
 * A label set to "only show here" works like Outlook's Other tab: in the
 * Inbox, the conversations it matches show only under its own tab.
 * A label without a complete rule matches everything, so it hides nothing.
 */
export function hiddenBySplitLabel(
  thread: MonoThread,
  splitLabels: { rules: FilterCriteria[] }[],
  labelIdsByName: (name: string) => string[],
  now: Date = new Date()
): boolean {
  return splitLabels.some(
    (label) =>
      label.rules.some(isRuleComplete) &&
      threadMatchesFilters(thread, label.rules, labelIdsByName, now)
  );
}

/**
 * The "only show here" labels that hide mail from the tab with these rules.
 * In the Inbox, a split label's mail leaves All, Unread and every label that
 * isn't a split. Between two splits, the one earlier in the tab order keeps a
 * conversation both match (`order`: the tab ids as shown): before, Team and
 * Others each hid what the other matched, so a colleague's mail that Outlook
 * filed as Other showed under neither tab.
 */
export function splitLabelsFor<
  L extends { id?: string; rules: FilterCriteria[]; hideFromInbox?: boolean }
>(tabRules: FilterCriteria[], labels: L[], inInbox: boolean, order?: string[]): L[] {
  if (!inInbox) return [];
  const splits = labels.filter((l) => l.hideFromInbox && l.rules.some(isRuleComplete));
  const self = splits.find((l) => sameFilters(tabRules, l.rules));
  const others = splits.filter((l) => l !== self);
  if (!self || !order) return others;
  const rank = (l: L) => {
    const at = l.id === undefined ? -1 : order.indexOf(l.id);
    return at >= 0 ? at : order.length + labels.indexOf(l);
  };
  return others.filter((l) => rank(l) < rank(self));
}

/** Conversations a tab would show: the count beside its name. */
export function countForTab(
  threads: MonoThread[],
  tabRules: FilterCriteria[],
  splitLabels: { rules: FilterCriteria[] }[],
  labelIdsByName: (name: string) => string[],
  now: Date = new Date()
): number {
  let count = 0;
  for (const thread of threads) {
    if (!threadMatchesFilters(thread, tabRules, labelIdsByName, now)) continue;
    if (hiddenBySplitLabel(thread, splitLabels, labelIdsByName, now)) continue;
    count++;
  }
  return count;
}

/** Unread conversations a tab would show: the number beside its name. */
export function unreadCountForTab(
  threads: MonoThread[],
  tabRules: FilterCriteria[],
  splitLabels: { rules: FilterCriteria[] }[],
  labelIdsByName: (name: string) => string[],
  now: Date = new Date()
): number {
  return countForTab(
    threads.filter((t) => t.labelIds.includes('UNREAD')),
    tabRules,
    splitLabels,
    labelIdsByName,
    now
  );
}
