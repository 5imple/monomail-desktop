import { GmailMessage } from './index';

// Interface for a Gmail draft
export interface GmailDraft {
  draftId: string;
  message: GmailMessage;
}
