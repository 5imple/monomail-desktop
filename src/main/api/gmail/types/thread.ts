import { GmailMessage } from './index';

// Interface for the response of Get Thread
export interface GmailThreadGetResponse {
  id: string;
  historyId: string;
  subject: string;
  snippet: string;
  timestamp: number;
  messages: GmailMessage[];
}
