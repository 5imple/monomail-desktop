import { GmailMessage } from '@/main/api/gmail/types';
import { parseGmailMessage, parsePayloadPart } from '@/main/models/message/utils';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';

// Interface for a Gmail message payload
export interface MonoMessagePaylod {
  partId: string;
  mimeType: string;
  fileName: string;
  body: MonoMessageBody;
  parts?: MonoMessagePaylod[];
}

// Interface for the body of a Gmail message payload
export interface MonoMessageBody {
  attachmentId: string | null;
  size: number;
  data: string | null;
}

export interface IMonoMessage extends ThreadItemBase {
  id: string;
  timestamp: number;
  author: MonoRecipient;
  type: 'message';
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
  listUnsubscribe: { url: string[]; mailTo: string[] };
  inlineImageSize: number;
  inlineImages: Record<string, MonoAttachment>;
  attachments: Record<string, MonoAttachment>;
  payload: MonoMessagePaylod;
  bodyPlain?: string;
  bodyHtml?: string;
}

export class MonoMessage implements ThreadItemBase {
  id: string;
  timestamp: number;
  author: MonoRecipient;
  type: 'message';

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
  listUnsubscribe: { url: string[]; mailTo: string[] };
  inlineImageSize: number;
  inlineImages: Record<string, MonoAttachment>;
  attachments: Record<string, MonoAttachment>;
  payload: MonoMessagePaylod;
  bodyPlain?: string;
  bodyHtml?: string;

  // emailHistory: string[];

  constructor(data: Partial<IMonoMessage>) {
    if (!data.payload) {
      throw new Error('Payload is required to instantiate MonoMessage.');
    }
    this.id = data.id ?? '';
    this.timestamp = data.timestamp ?? Date.now();
    this.author = data.author ?? { name: '', email: '' };
    this.type = 'message';

    this.timestamp = data.timestamp ?? Date.now();
    this.timezone = data.timezone ?? '';
    this.threadId = data.threadId ?? '';
    this.subject = data.subject ?? '';
    this.labelIds = data.labelIds ?? [];
    this.snippet = data.snippet ?? null;
    this.historyId = data.historyId ?? null;
    this.cc = data.cc ?? [];
    this.bcc = data.bcc ?? [];
    this.to = data.to ?? [];
    this.from = data.from ?? { name: '', email: '' };
    this.listUnsubscribe = data.listUnsubscribe ?? { url: [], mailTo: [] };
    this.inlineImageSize = data.inlineImageSize ?? 0;
    this.inlineImages = data.inlineImages ?? {};
    this.attachments = data.attachments ?? {};
    this.payload = data.payload;
    this.bodyPlain = data.bodyPlain;
    this.bodyHtml = data.bodyHtml;
  }

  /**
   * Converts a MonoMessage instance to a plain object for storage or serialization.
   */
  toPlainObject(): IMonoMessage {
    return {
      id: this.id,
      timestamp: this.timestamp,
      author: this.author,
      type: this.type,
      timezone: this.timezone,
      threadId: this.threadId,
      subject: this.subject,
      labelIds: this.labelIds,
      snippet: this.snippet,
      historyId: this.historyId,
      cc: this.cc,
      bcc: this.bcc,
      to: this.to,
      from: this.from,
      inlineImageSize: this.inlineImageSize,
      inlineImages: this.inlineImages,
      attachments: this.attachments,
      listUnsubscribe: this.listUnsubscribe,
      payload: this.payload,
      bodyPlain: this.bodyPlain,
      bodyHtml: this.bodyHtml
    };
  }

  /**
   * Creates a MonoMessage instance from a plain object.
   */
  static fromPlainObject(data: Partial<IMonoMessage>): MonoMessage {
    return new MonoMessage(data);
  }

  /**
   * Extracts the email addresses from the "to" field.
   */
  getRecipientEmails(): string[] {
    return this.to.map((recipient) => recipient.email);
  }

  /**
   * Checks if the message is a draft.
   */
  isDraft(): boolean {
    return this.labelIds.includes('DRAFT');
  }

  /**
   * Parses a GmailMessage into a MonoMessage.
   */
  static fromGmailMessage(message: GmailMessage): MonoMessage {
    return parseGmailMessage(message);
  }

  /**
   * Parses a MonoDraft into a MonoMessage.
   */
  static fromDraft(message: GmailMessage): MonoMessage {
    return parseGmailMessage(message);
  }

  getParsedBody(): string {
    return parsePayloadPart(this).content;
  }

  getParsedHistory(): string[] {
    return parsePayloadPart(this).history;
  }

  /**
   * Extracts the ThreadItemBase part of the MonoMessage.
   */
  getItemBase(): ThreadItemBase {
    return {
      id: this.id,
      timestamp: this.timestamp,
      author: this.author,
      type: this.type
    };
  }

  // /**
  //  * Extracts the non-ThreadItemBase part of the MonoMessage.
  //  */
  // getNonThreadItemBasePart(): Omit<IMonoMessage, keyof ThreadItemBase> {
  //   const { id, timestamp, author, type, ...nonThreadBase } = this.toPlainObject();
  //   return nonThreadBase;
  // }
}
