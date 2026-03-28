import { GmailMessage } from './index';

// Interface for the response of Get Inbox Threads
export interface GmailThreadListResponse {
  threads: GmailThreadGetResponse[];
  nextPageToken?: string;
}

// Interface for the response of Get Thread
export interface GmailThreadGetResponse {
  id: string;
  historyId: string;
  subject: string;
  snippet: string;
  timestamp: number;
  messages: GmailMessage[];
}

// Interface for the response of Update Thread
export interface GmailThreadUpdateResponse {
  addLabelIds: string[];
  removeLabelIds: string[];
}
