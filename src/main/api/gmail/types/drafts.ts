import { GmailMessage } from './index';

// Interface for a Gmail draft
export interface GmailDraft {
  draftId: string;
  message: GmailMessage;
}

// Interface for the response of Get Draft List
export interface GmailDraftListResponse {
  drafts: GmailDraft[];
  nextPageToken?: string;
}

// Interface for the response of Create Draft
export interface GmailDraftCreateResponse {
  messageId: string;
  draftId: string;
}

// Interface for the response of Update Draft
export interface GmailDraftUpdateResponse {
  messageId: string;
  draftId: string;
}

// Interface for the response of Send Draft
export interface GmailDraftSendResponse {
  id: string;
  threadId: string;
}
