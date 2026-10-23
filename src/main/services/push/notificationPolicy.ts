// Pure new-mail notification policy: which push frames deserve a banner, when a
// burst collapses into one summary banner, and how the alert sound is played.
// Kept free of electron / electron-store imports (types only from elsewhere) so
// it is unit-testable under the M365 harness; pushHandler wires it to
// SystemManager / NotificationManager / the main window.

import type { SplitCategoryPreferences } from '@/main/api/auth/types';
import { MAIN_STRINGS } from '@/main/utils/strings';
import type { AudioType } from '@/renderer/app/lib/soundManager';

/**
 * Mail received longer ago than this (by the server's receive time) is backlog,
 * not news: the first poll after launch or wake replays everything since the
 * stored cursor, and none of that should raise a banner.
 */
export const NOTIFY_MAX_AGE_MS = 10 * 60_000;

/** More notifiable messages than this in one dispatch collapse into one summary banner. */
export const SUMMARY_THRESHOLD = 3;

/** How many notified message keys to remember, so a re-upsert (flagged, moved) never re-notifies. */
export const RECENTLY_NOTIFIED_LIMIT = 1000;

/** How long a thread restored from snooze stays quiet, so the poller's follow-up upsert does not notify twice. */
export const RESTORED_THREAD_QUIET_MS = 2 * 60_000;

/** Parses the Gmail-style "[A, B, C]" label string a push frame carries. */
export function parseFrameLabels(labels: string | undefined): string[] {
  return (labels ?? '')
    .replace(/[\\[\]\s]/g, '')
    .split(',')
    .filter(Boolean);
}

/**
 * The PRIMARY notification preference: Inbox mail that is not in a split
 * category the user chose to hide. Unset category preferences count as hidden,
 * matching the previous behaviour.
 */
export function isPrimaryLabels(labelIds: string[], prefs?: SplitCategoryPreferences): boolean {
  if (!labelIds.includes('INBOX')) return false;
  if (labelIds.includes('CATEGORY_PERSONAL')) return true;
  const hidden = [
    prefs?.showSocial ? null : 'CATEGORY_SOCIAL',
    prefs?.showPromotions ? null : 'CATEGORY_PROMOTIONS',
    prefs?.showForums ? null : 'CATEGORY_FORUMS',
    prefs?.showUpdates ? null : 'CATEGORY_UPDATES'
  ].filter((label): label is string => label !== null);
  return !labelIds.some((label) => hidden.includes(label));
}

/**
 * The per-account notification preference ('OFF' | 'ALL' | 'PRIMARY' | a label
 * id; unset means 'INBOX'). Drafts and sent mail never notify.
 */
export function passesNotificationPreference(
  labelIds: string[],
  preference: string | undefined,
  prefs?: SplitCategoryPreferences
): boolean {
  if (labelIds.includes('DRAFT') || labelIds.includes('SENT')) return false;
  const pref = preference || 'INBOX';
  if (pref === 'OFF') return false;
  if (pref === 'ALL') return true;
  if (pref === 'PRIMARY') return isPrimaryLabels(labelIds, prefs);
  return labelIds.includes(pref);
}

/**
 * Only unread mail that just arrived is news. A frame for a message read or
 * flagged elsewhere lacks UNREAD; a frame whose receivedAt is older than
 * NOTIFY_MAX_AGE_MS is backlog. Frames without receivedAt (Gmail) skip the age
 * check, and an unparseable time is not grounds to drop a banner.
 */
export function isFreshUnread(
  labelIds: string[],
  receivedAt: string | undefined,
  now: number
): boolean {
  if (!labelIds.includes('UNREAD')) return false;
  if (!receivedAt) return true;
  const receivedMs = Date.parse(receivedAt);
  if (!Number.isFinite(receivedMs)) return true;
  return now - receivedMs <= NOTIFY_MAX_AGE_MS;
}

/** Bounded, insertion-ordered key set: remembers only the newest `limit` keys. */
export class RecentKeySet {
  private keys = new Set<string>();

  constructor(private readonly limit: number) {}

  has(key: string): boolean {
    return this.keys.has(key);
  }

  add(key: string): void {
    // Re-adding refreshes the key's position so it is evicted last.
    this.keys.delete(key);
    this.keys.add(key);
    while (this.keys.size > this.limit) {
      const oldest = this.keys.values().next().value;
      if (oldest === undefined) break;
      this.keys.delete(oldest);
    }
  }

  get size(): number {
    return this.keys.size;
  }
}

/** Key set whose entries expire after a per-entry time to live. */
export class ExpiringKeySet {
  private until = new Map<string, number>();

  add(key: string, now: number, ttlMs: number): void {
    this.until.set(key, now + ttlMs);
  }

  has(key: string, now: number): boolean {
    for (const [k, expiresAt] of this.until) {
      if (expiresAt <= now) this.until.delete(k);
    }
    return this.until.has(key);
  }
}

export type BannerPlan<T> = { kind: 'individual'; items: T[] } | { kind: 'summary'; items: T[] };

/**
 * One banner per message for a handful; past SUMMARY_THRESHOLD, one summary
 * banner ("N new emails") instead of a wall of banners.
 */
export function planBanners<T>(items: T[]): BannerPlan<T> | null {
  if (items.length === 0) return null;
  return items.length > SUMMARY_THRESHOLD
    ? { kind: 'summary', items }
    : { kind: 'individual', items };
}

/** Title and body of the summary banner for `count` messages from `senders`. */
export function summaryBannerText(
  count: number,
  senders: string[]
): { title: string; body: string } {
  const strings = MAIN_STRINGS.notifications;
  const unique = [...new Set(senders.map((s) => s.trim()).filter(Boolean))];
  let body = '';
  if (unique.length === 1) body = strings.newMailSummaryBodyOne(unique[0]);
  else if (unique.length === 2) body = strings.newMailSummaryBodyTwo(unique[0], unique[1]);
  else if (unique.length > 2) body = strings.newMailSummaryBodyMany(unique[0], unique[1]);
  return { title: strings.newMailSummaryTitle(count), body };
}

export interface AlertSoundPlan {
  /** Pass to every native banner: true keeps the OS default sound from playing. */
  silentNative: boolean;
  /** Play this once per batch in the main window's renderer, or null. */
  rendererSound: AudioType | null;
}

/**
 * The alert sound chosen in Settings > Notifications. 'Off' silences mail
 * banners. Otherwise the native banner is silent and the main window's renderer
 * plays the chosen sound once per batch; with no window able to play it (closed
 * to the tray, still loading), fall back to the OS sound so mail stays audible.
 */
export function planAlertSound(
  sound: AudioType | undefined,
  rendererAvailable: boolean
): AlertSoundPlan {
  if (sound === 'Off') return { silentNative: true, rendererSound: null };
  if (rendererAvailable) return { silentNative: true, rendererSound: sound ?? 'Mono' };
  return { silentNative: false, rendererSound: null };
}
