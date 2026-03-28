import { GmailThreadGetResponse } from '@/main/api/gmail/types';
import { IMonoDraft, MonoDraft } from '@/main/models/draft/MonoDraft';
import { IMonoMessage, MonoMessage } from '@/main/models/message/MonoMessage';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { parseGmailThread } from '@/main/models/thread/utils';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { MonoThreadRecord } from '@/renderer/app/lib/db/types/index';

export interface IMonoThread {
  accountId: string;
  id: string;
  labelIds: string[];
  attachments: Record<string, MonoAttachment>;
  from: MonoRecipient[];
  bcc: MonoRecipient[];
  cc: MonoRecipient[];
  to: MonoRecipient[];
  subject: string;
  snippet: string | null;
  historyId: string | null;
  timestamp: number;
  items: ThreadItemBase[];
}

export class MonoThread {
  accountId: string;
  id: string;
  labelIds: string[];
  attachments: Record<string, MonoAttachment>;
  from: MonoRecipient[];
  bcc: MonoRecipient[];
  cc: MonoRecipient[];
  to: MonoRecipient[];
  subject: string;
  snippet: string | null;
  historyId: string | null;
  timestamp: number;
  items: ThreadItemBase[];

  constructor(data: Partial<IMonoThread>) {
    this.id = data.id ?? '';
    this.accountId = data.accountId ?? '';
    this.historyId = data.historyId ?? '';
    this.labelIds = data.labelIds ?? [];
    this.attachments = data.attachments ?? {};
    this.from = data.from ?? [];
    this.bcc = data.bcc ?? [];
    this.cc = data.cc ?? [];
    this.to = data.to ?? [];
    this.subject = data.subject ?? '';
    this.snippet = data.snippet ?? '';
    this.timestamp = data.timestamp ?? Date.now();
    this.items = data.items?.map((item) => MonoThread.constructItem(item)) ?? [];
  }

  /**
   * Converts the MonoThread instance to a plain object.
   */
  toPlainObject(): IMonoThread {
    return { ...this };
  }

  /**
   * Creates a MonoThread instance from a plain object.
   */
  static fromPlainObject(data: IMonoThread): MonoThread {
    return new MonoThread(data);
  }

  static constructItem(item: ThreadItemBase): MonoDraft | MonoMessage {
    if (item instanceof MonoDraft || item instanceof MonoMessage) {
      return item; // Already an instance
    }

    if (item.type === 'draft') {
      return MonoDraft.fromPlainObject(item as IMonoDraft);
    } else if (item.type === 'message') {
      return MonoMessage.fromPlainObject(item as IMonoMessage);
    }

    throw new Error(`Unsupported item type: ${item.type}`);
  }
  /**
   * Parses a GmailThreadGetResponse into a MonoThread.
   */
  static fromGmail(accountId: string, thread: GmailThreadGetResponse): MonoThread {
    // Helper function to get unique recipients
    return parseGmailThread(accountId, thread);
  }

  getLastMessage(): MonoMessage | null {
    const messages = this.items.filter((item): item is MonoMessage => item.type === 'message');
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }
}
