import { MonoAttachment, MonoRecipient } from '@/main/models/types';

// Interface for a Gmail message payload
export interface GmailMessagePayload {
  partId: string;
  mimeType: string;
  fileName: string;
  body: GmailMessageBody;
  parts?: GmailMessagePayload[];
}

// Interface for the body of a Gmail message payload
export interface GmailMessageBody {
  attachmentId: string | null;
  size: number;
  data: string | null;
}

// Interface for a Gmail message
export interface GmailMessage {
  id: string;
  timestamp: number;
  timezone: string;
  threadId: string;
  subject: string;
  labelIds: string[];
  snippet: string | null;
  historyId: string | null;
  cc: MonoRecipient[];
  bcc: MonoRecipient[];
  to: MonoRecipient[];
  from: MonoRecipient;
  inlineImageSize: number;
  listUnsubscribe: { url: string[]; mailTo: string[] };
  inlineImages: Record<string, MonoAttachment>;
  attachments: Record<string, MonoAttachment>;
  payload: GmailMessagePayload;
}

// Interface for the response of Send Message
export interface GmailMessageSendResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

// Interface for the response of Get Attachment
export interface GmailMessageAttachmentResponse {
  attachmentId: string;
  size: number;
  data: string;
  mimeType: string;
}
