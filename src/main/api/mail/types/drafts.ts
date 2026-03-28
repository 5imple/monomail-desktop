import { MailMessage } from './message';

export interface MailDraft {
  draftId: string;
  message: MailMessage;
}

export interface MailDraftListResponse {
  drafts: MailDraft[];
  nextPageToken?: string;
}

export interface MailDraftCreateResponse {
  messageId: string;
  draftId: string;
}

export interface MailDraftUpdateResponse {
  messageId: string;
  draftId: string;
}

export interface MailDraftSendResponse {
  id: string;
  threadId: string;
}
