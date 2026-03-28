import { IMonoDraft } from '@/main/models/draft/MonoDraft';
import { IMonoMessage } from '@/main/models/message/MonoMessage';

// export interface MonoDraftRecord {
//   id: string;
//   threadId: string;
//   messageId: string;
// }
export interface MonoDraftRecord extends IMonoDraft {}

export interface MonoMessageRecord extends IMonoMessage {}
export interface MonoThreadRecord {
  id: string;
  accountId: string;
  subject: string;
  snippet: string | null;
  historyId: string | null;
  timestamp: number;
  items: string[];
}

export interface SyncHistoryMetaRecord {
  key: string; // 'accountMeta' or other key identifier
  accountId: string;
  historyId: string;
  lastUpdatedAt: number; // timestamp
  lastSyncQuery?: string;
}
