import { initDB } from '@/renderer/app/lib/db/db';
import { DraftAttachmentRecord } from '@/renderer/app/lib/db/types/index';

/**
 * Persist a draft attachment / inline-image blob locally. In standalone mode the
 * bytes stay here until the draft is sent (buildRawMessage encodes them) or the
 * draft is discarded.
 * @param uid - User ID for the database namespace.
 * @param record - The attachment record including the Blob.
 */
export async function DBSaveAttachmentBlob(
  uid: string,
  record: DraftAttachmentRecord
): Promise<void> {
  const db = await initDB(uid);
  await db.put('draftAttachments', record);
}

/**
 * Get a single draft attachment blob by its id.
 */
export async function DBGetAttachmentBlob(
  uid: string,
  attachmentId: string
): Promise<DraftAttachmentRecord | undefined> {
  const db = await initDB(uid);
  return db.get('draftAttachments', attachmentId);
}

/**
 * Get all locally-held attachment blobs for a draft.
 */
export async function DBGetAttachmentsForDraft(
  uid: string,
  draftId: string
): Promise<DraftAttachmentRecord[]> {
  const db = await initDB(uid);
  return db.getAllFromIndex('draftAttachments', 'byDraftId', draftId);
}

/**
 * Delete a single attachment blob.
 */
export async function DBDeleteAttachmentBlob(uid: string, attachmentId: string): Promise<void> {
  const db = await initDB(uid);
  await db.delete('draftAttachments', attachmentId);
}

/**
 * Delete all attachment blobs belonging to a draft (after send or discard).
 */
export async function DBDeleteAttachmentsForDraft(uid: string, draftId: string): Promise<void> {
  const db = await initDB(uid);
  const tx = db.transaction('draftAttachments', 'readwrite');
  const index = tx.store.index('byDraftId');
  let cursor = await index.openCursor(draftId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
