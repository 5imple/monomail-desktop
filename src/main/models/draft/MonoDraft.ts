import { MonoMessage } from '@/main/models/message/MonoMessage';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { generateUUID } from '@/main/utils';

export interface IMonoDraft extends ThreadItemBase {
  id: string;
  threadId: string;
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  labelIds: string[];
  subject: string;
  body: string;
  attachments: Record<string, MonoAttachment>;
  signatureId?: string;
  timestamp: number;
  isAiGenerated: boolean;
}

export class MonoDraft implements ThreadItemBase {
  id: string;
  timestamp: number;
  author: MonoRecipient;
  type: 'draft';

  threadId: string;
  messageId: string;
  isAiGenerated: boolean;

  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  labelIds: string[];
  signatureId?: string;
  attachments: Record<string, MonoAttachment>;

  constructor(data: Partial<IMonoDraft> = {}) {
    this.id = data.id ?? generateUUID();
    this.timestamp = data.timestamp ?? Date.now();
    this.author = data.author ?? { name: '', email: '' };
    this.type = 'draft';

    this.messageId = data.messageId ?? '';
    this.threadId = data.threadId ?? '';
    this.to = data.to ?? [];
    this.cc = data.cc ?? [];
    this.bcc = data.bcc ?? [];
    this.subject = data.subject ?? '';
    this.body = data.body ?? '';
    this.from = data.from ?? '';
    this.labelIds = data.labelIds ?? ['DRAFT'];
    this.signatureId = data.signatureId ?? '';
    this.isAiGenerated = data.isAiGenerated ?? false;
    this.attachments = data.attachments ?? {};
  }

  /**
   * Update fields of the draft.
   * Automatically updates the `timestamp` timestamp.
   */
  update(data: Partial<IMonoDraft>): void {
    if (data.id !== undefined) this.id = data.id;
    if (data.to !== undefined) this.to = data.to;
    if (data.cc !== undefined) this.cc = data.cc;
    if (data.bcc !== undefined) this.bcc = data.bcc;
    if (data.subject !== undefined) this.subject = data.subject;
    if (data.body !== undefined) this.body = data.body;
    if (data.signatureId !== undefined) this.signatureId = data.signatureId;
    if (data.from !== undefined) this.from = data.from;
    if (data.labelIds !== undefined) this.labelIds = data.labelIds;
    if (data.attachments !== undefined) this.attachments = data.attachments;
    if (data.threadId !== undefined) this.threadId = data.threadId;
    if (data.messageId !== undefined) this.messageId = data.messageId;
    if (data.isAiGenerated !== undefined) this.isAiGenerated = data.isAiGenerated;
    this.timestamp = new Date().getTime();
  }

  removeSignatureId(): void {
    this.signatureId = undefined;
  }

  /**
   * Converts the draft into a plain object for persistence or API usage.
   */
  toPlainObject(): IMonoDraft {
    return {
      id: this.id,
      timestamp: this.timestamp,
      author: this.author,
      type: this.type,

      threadId: this.threadId,
      messageId: this.messageId,

      from: this.from,
      to: this.to,
      cc: this.cc,
      bcc: this.bcc,

      subject: this.subject,
      body: this.body,
      labelIds: this.labelIds,
      signatureId: this.signatureId,
      attachments: this.attachments,
      isAiGenerated: this.isAiGenerated
    };
  }

  /**
   * Creates a Draft instance from a plain object.
   */
  static fromPlainObject(data: IMonoDraft): MonoDraft {
    return new MonoDraft(data);
  }

  /**
   * Parses a MonoMessage into a MonoDraft.
   */
  static fromMessage(message: MonoMessage, draftId?: string): MonoDraft {
    return new MonoDraft({
      id: draftId ?? '',
      timestamp: message.timestamp,
      author: message.author,
      threadId: message.threadId,
      messageId: message.id,
      to: message.to.map((recipient) => recipient.email),
      cc: message.cc.map((recipient) => recipient.email),
      bcc: message.bcc.map((recipient) => recipient.email),
      subject: message.subject,
      body: message.getParsedBody(),
      isAiGenerated: false,
      labelIds: message.labelIds
    });
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
}
