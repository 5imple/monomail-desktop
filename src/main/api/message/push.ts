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
 *       "type": "MESSAGE_ADDED" | "AI_DRAFT_ADDED" | "MESSAGE_DELETED" | "LABEL_ADDED" | "LABEL_REMOVED",
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
