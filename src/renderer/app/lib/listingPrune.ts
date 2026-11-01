/**
 * Which cached messages have left a folder (the Inbox) although the app was
 * never told: archived, moved or deleted in Outlook while the change didn't
 * reach the app (the change tracker was reset, or its notice was dropped).
 * Without this they stayed in the Inbox for good: the cache kept their INBOX
 * label and a refresh only ever adds.
 *
 * `listed` is the folder's newest messages by received time (ids only), so
 * every message still in the folder that is newer than the oldest listed one
 * is listed. A cached message labelled with the folder, in that range and not
 * listed, has left it. Each message is judged on its own: an older one of
 * the same conversation, below the range, can't be judged and is kept.
 *
 * Mail newer than the listing (arrived after the server read the folder) is
 * never judged: up to the newest listed message, or `startedAt` less a margin
 * for clock differences when that is later.
 */

export interface PruneItem {
  id: string;
  type?: string;
  timestamp: number;
  labelIds?: string[];
}

export interface PruneThread {
  id: string;
  items: PruneItem[];
}

export interface LeftFolder {
  threadId: string;
  /** Its messages that have left the folder. */
  messageIds: string[];
  /** No message of it is known to be in the folder any more. */
  emptied: boolean;
}

/** Device and server clocks can disagree by this much. */
export const CLOCK_MARGIN_MS = 2 * 60 * 1000;

/**
 * A message the cache says is in the folder. Your own sent mail and drafts
 * never are (an Outlook message has one folder), even if a label says so:
 * "Move to Inbox" labels the whole conversation here at once.
 */
export function cachedInFolder(item: PruneItem, folderLabel: string): boolean {
  if (item.type && item.type !== 'message') return false;
  const labels = item.labelIds ?? [];
  return labels.includes(folderLabel) && !labels.includes('SENT') && !labels.includes('DRAFT');
}

export function leftFolder({
  shown,
  listed,
  complete,
  folderLabel,
  startedAt,
  isProtected = () => false
}: {
  /** Cached conversations of this account, with all their cached messages. */
  shown: PruneThread[];
  /** The folder's newest messages (any order). */
  listed: { id: string; timestamp: number }[];
  /** `listed` is the whole folder. */
  complete: boolean;
  folderLabel: string;
  /** When the listing was requested (device clock). */
  startedAt: number;
  /** Changed here moments ago (the server may not have it yet): left alone. */
  isProtected?: (threadId: string) => boolean;
}): LeftFolder[] {
  const listedIds = new Set(listed.map((m) => m.id));
  let oldest = Infinity;
  let newest = -Infinity;
  for (const message of listed) {
    if (message.timestamp < oldest) oldest = message.timestamp;
    if (message.timestamp > newest) newest = message.timestamp;
  }
  // Part of a folder with nothing listed: nothing to compare against.
  if (!complete && listed.length === 0) return [];
  // Strictly newer than the oldest listed: a tie may be just past the listing.
  const lower = complete ? -Infinity : oldest;
  const upper = Math.max(newest, startedAt - CLOCK_MARGIN_MS);

  const result: LeftFolder[] = [];
  for (const thread of shown) {
    if (isProtected(thread.id)) continue;
    const inFolder = thread.items.filter((item) => cachedInFolder(item, folderLabel));
    const gone = inFolder.filter(
      (item) => !listedIds.has(item.id) && item.timestamp > lower && item.timestamp <= upper
    );
    if (gone.length === 0) continue;
    result.push({
      threadId: thread.id,
      messageIds: gone.map((item) => item.id),
      emptied: gone.length === inFolder.length
    });
  }
  return result;
}
