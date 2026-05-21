/**
 * Type contracts for the P8 Later Queue HTTP API. Mirrors the shapes
 * documented in project_p8_backend_plan.md and implemented in
 * scripts/mock-backend.mjs.
 */

export interface QueueContactRef {
  id: string;
  name: string;
  email: string;
}

export interface ThreadSnapshot {
  subject: string;
  snippet: string;
  from: QueueContactRef;
  isStarred: boolean;
}

export interface DraftSnapshot {
  subject: string;
  bodySnippet: string;
  recipients: QueueContactRef[];
  attachmentCount: number;
  isReply: boolean;
}

export interface CreateSnoozeRequest {
  threadId: string;
  accountId: string;
  snoozeUntil: string;
  threadSnapshot?: ThreadSnapshot;
}

export interface SnoozeRecord {
  snoozeId: string;
  threadId: string;
  accountId: string;
  snoozeUntil: string;
  createdAt: string;
  threadSnapshot: ThreadSnapshot;
}

export interface CreateScheduleRequest {
  draftId: string;
  accountId: string;
  sendAt: string;
  draftSnapshot?: DraftSnapshot;
}

export interface ScheduleRecord {
  scheduleId: string;
  draftId: string;
  accountId: string;
  sendAt: string;
  createdAt: string;
  draftSnapshot: DraftSnapshot;
}

export interface ListResponse<T> {
  items: T[];
}

export interface SuccessResponse {
  ok: boolean;
}

export interface SendNowResponse {
  ok: boolean;
  messageId: string;
}
