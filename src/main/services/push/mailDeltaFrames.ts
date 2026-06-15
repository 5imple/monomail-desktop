// Pure frame-synthesis + backoff logic for the Microsoft delta poller (Phase 11).
// Kept free of electron / electron-store / net imports — and importing only the
// erased TYPE of GraphMessage (never the transform chain, which pulls dompurify)
// — so the new-mail-delivery logic is unit-testable under the M365 harness.

import type { GraphDeltaItem, GraphMessage } from '@/main/api/mail/graphTransforms';
import type {
  MessageAddedPayload,
  MessageDeletedPayload,
  PushPayload
} from '@/main/api/message/push';

export type MailDeltaFrame = PushPayload<MessageAddedPayload | MessageDeletedPayload>;

export type DeltaPollStatus = 'ok' | 'reset' | 'retry' | 'expired' | 'error';

/** Base foreground cadence; the poller backs off from here on failure. */
export const POLL_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

// Well-known Graph folder → normalized Mono labels carried on the synthesized
// frame. v1 drives only `inbox`, but keep the map general so a frame's labels
// stay correct if the poller is widened to the other tracked folders. Archive
// maps to no label (Gmail has no Archive label — archived mail simply lacks
// INBOX), matching the Phase 5 folder mapping.
const FOLDER_FRAME_LABELS: Record<string, string[]> = {
  inbox: ['INBOX'],
  sentitems: ['SENT'],
  deleteditems: ['TRASH'],
  junkemail: ['SPAM'],
  archive: []
};

// The push-frame `labels` field is the Gmail-style "[A, B, C]" string that
// MessageContext.normalizeGmailLabels parses; the Microsoft path feeds it
// already-normalized labels (Phase 5).
function labelString(labels: string[]): string {
  return `[${labels.join(', ')}]`;
}

function senderDisplay(msg: GraphMessage): string {
  const ea = (msg.from ?? msg.sender)?.emailAddress;
  return ea?.name?.trim() || ea?.address?.trim() || 'New email';
}

/**
 * Splits a /messages/delta page's `value` into upserts (new/changed messages)
 * and removed message ids (the `@removed` tombstones). Mirrors the provider's
 * splitDeltaPage but is duplicated here so the main poller never imports the
 * dompurify-tainted transform module.
 */
export function splitDelta(value: GraphDeltaItem[] | undefined): {
  upserts: GraphMessage[];
  removedIds: string[];
} {
  const upserts: GraphMessage[] = [];
  const removedIds: string[] = [];
  for (const item of value ?? []) {
    if (item && item['@removed']) {
      if (item.id) removedIds.push(item.id);
    } else if (item?.id) {
      upserts.push(item);
    }
  }
  return { upserts, removedIds };
}

/**
 * Builds the push frames a delta page produces, in the exact envelope shape
 * MessageContext already consumes:
 *  - each upsert → MESSAGE_ADDED (the renderer re-fetches the full message via
 *    the provider-aware mailApi.getMessage, so only aAUid + id are load-bearing;
 *    threadId/labels/notification drive de-dup, list refresh and notifications);
 *  - each removed id → MESSAGE_DELETED. The Graph @removed tombstone carries no
 *    conversationId, so threadId is left empty and the renderer resolves it from
 *    the local cache before pruning the thread.
 */
export function synthesizeDeltaFrames(
  uid: string,
  folder: string,
  upserts: GraphMessage[],
  removedIds: string[]
): MailDeltaFrame[] {
  const labels = FOLDER_FRAME_LABELS[folder] ?? [];
  const frames: MailDeltaFrame[] = [];

  for (const msg of upserts) {
    const msgLabels = msg.isRead ? labels : [...labels, 'UNREAD'];
    frames.push({
      data: {
        type: 'MESSAGE_ADDED',
        aAUid: uid,
        id: msg.id,
        threadId: msg.conversationId ?? msg.id,
        labels: labelString(msgLabels),
        verification: 'false',
        link: '',
        code: ''
      },
      notification: { title: senderDisplay(msg), body: msg.subject ?? '' }
    });
  }

  for (const id of removedIds) {
    frames.push({
      data: {
        type: 'MESSAGE_DELETED',
        aAUid: uid,
        id,
        threadId: ''
      }
    });
  }

  return frames;
}

/**
 * Diffs the desired set of polled accounts against the currently-polled set.
 * The poller uses this to reconcile on account-change events INSTEAD of blanket
 * restarting: when the set is unchanged it returns empty lists, so a token
 * refresh (which re-emits the change events) does NOT trigger a re-poll — which
 * would refresh again, a 100% CPU feedback loop.
 */
export function diffPolledAccounts(
  desired: string[],
  current: string[]
): { toStart: string[]; toStop: string[] } {
  const desiredSet = new Set(desired);
  const currentSet = new Set(current);
  return {
    toStart: [...desiredSet].filter((uid) => !currentSet.has(uid)),
    toStop: [...currentSet].filter((uid) => !desiredSet.has(uid))
  };
}

/**
 * Delay until the next poll for one account. `ok`/`reset` resume the base
 * cadence; `retry` (429) honors Retry-After (floored at the base interval);
 * transient/auth failures back off exponentially, capped at MAX_BACKOFF_MS.
 */
export function nextPollDelay(
  status: DeltaPollStatus,
  retryAfterMs: number,
  consecutiveFailures: number
): number {
  if (status === 'ok' || status === 'reset') return POLL_INTERVAL_MS;
  if (status === 'retry') {
    return Math.min(Math.max(retryAfterMs, POLL_INTERVAL_MS), MAX_BACKOFF_MS);
  }
  // error / expired: exponential backoff (cap the exponent so it can't overflow).
  const exponent = Math.min(Math.max(consecutiveFailures, 1), 4);
  return Math.min(POLL_INTERVAL_MS * 2 ** exponent, MAX_BACKOFF_MS);
}
