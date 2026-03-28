import { MonoAttachment, MonoRecipient } from '@/main/models/types';

export interface MailMessagePayload {
  partId: string;
  mimeType: string;
  fileName: string;
  body: MailMessageBody;
  parts?: MailMessagePayload[];
}

export interface MailMessageBody {
  attachmentId: string | null;
  size: number;
  data: string | null;
}

export interface MailMessage {
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
  payload: MailMessagePayload;
}

export interface MailMessageSendResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface MailMessageAttachmentResponse {
  attachmentId: string;
  size: number;
  data: string;
  mimeType: string;
}
