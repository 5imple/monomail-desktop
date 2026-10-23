/**
 * Phase-B push payload types. Same wire shape the legacy FCM delivery used
 * (the message `data` map) — the consumer in MessageContext doesn't change.
 * The transport switched from FCM to a backend-owned WebSocket; the
 * envelope at the React boundary is unchanged so the migration is purely
 * a transport swap.
 *
 * Frames over the wire look like:
 *   {
 *     "data": {
 *       "type": "MESSAGE_ADDED" | "AI_DRAFT_ADDED" | "MESSAGE_DELETED" | "LABEL_ADDED" | "LABEL_REMOVED" | "THREAD_RESTORED",
 *       "aAUid": "<account uid>",
 *       "threadId": "...",
 *       ...etc
 *     },
 *     "notification"?: { "title": "...", "body": "..." }
 *   }
 */

export interface PushPayload<TData = Record<string, string>> {
  data?: TData;
  notification?: {
    title?: string;
    body?: string;
    image?: string;
  };
}

export interface MessageAddedPayload {
  aAUid: string;
  labels: string;
  id: string;
  threadId: string;
  type: 'MESSAGE_ADDED';
  verification: 'true' | 'false';
  link: string;
  code: string;
  /**
   * ISO 8601 server receive time. Optional and additive: the Microsoft delta
   * poller sets it so backlog (mail received long before this frame) does not
   * raise a banner; frames without it skip the age check.
   */
  receivedAt?: string;
}

/**
 * A conversation came back to the Inbox without a new message (a due snooze).
 * Main has no message ids for it, so the renderer re-fetches the thread.
 */
export interface ThreadRestoredPayload {
  aAUid: string;
  threadId: string;
  type: 'THREAD_RESTORED';
}

/**
 * Metadata carried by every native notification main creates, and delivered
 * back on 'renderer:notification:native:clicked'. `threadId` is absent for
 * notifications that are not about one conversation (a "N new emails" summary,
 * a scheduled send with no thread): the click then only brings the account's
 * inbox forward.
 */
export interface NotificationClickPayload {
  uid: string;
  threadId?: string;
}

export interface AIDraftAddedPayload {
  aAUid: string;
  id: string;
  threadId: string;
  type: 'AI_DRAFT_ADDED';
}

export interface MessageDeletedPayload {
  id: string;
  type: 'MESSAGE_DELETED';
  threadId: string;
  aAUid: string;
}

export interface MessageLabelModificationPayload {
  id: string;
  type: 'LABEL_ADDED' | 'LABEL_REMOVED';
  threadId: string;
  labels: string;
  aAUid: string;
}
