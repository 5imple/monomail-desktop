import { MailMessage } from './message';

export interface MailThreadListResponse {
  threads: MailThreadGetResponse[];
  nextPageToken?: string;
}

export interface MailThreadGetResponse {
  id: string;
  historyId: string;
  subject: string;
  snippet: string;
  timestamp: number;
  messages: MailMessage[];
}

export interface MailThreadUpdateResponse {
  addLabelIds: string[];
  removeLabelIds: string[];
}
