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

// Locally-held bytes for a draft's attachments and inline images. In standalone
// (no-backend) mode the file bytes live here in IndexedDB until the draft is
// sent, at which point buildRawMessage encodes them into the MIME message.
// `inline` images are referenced from the body via `cid:${contentId}`.
export interface DraftAttachmentRecord {
  attachmentId: string;
  draftId: string;
  fileName: string;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId?: string;
  blob: Blob;
}
