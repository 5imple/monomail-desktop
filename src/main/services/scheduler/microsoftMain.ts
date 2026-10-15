import {
  FolderedMessage,
  MOVE_FOLDERS,
  MoveFolderIds,
  selectMessagesToMove
} from '@/main/api/mail/graphRequestMapping';
import { graphGetMain, graphPostMain } from '@/main/services/push/graphFetchMain';

// Microsoft Graph mail moves made directly from the main process (for the
// scheduler, which fires when the renderer window may be closed). The
// renderer/worker microsoftMailProvider uses graphApiClient/graphBatch, which
// only run inside a renderer — so the scheduler needs this main-native path,
// mirroring the provider's conversationId -> /move semantics via graphFetchMain.

const GRAPH_TOP = '50';
const MAX_PAGES = 20;

interface GraphMessageList {
  value?: FolderedMessage[];
  '@odata.nextLink'?: string;
}

/** All messages of a conversation with their folders, across folders (a
 *  snoozed/reminded thread was moved to Archive, so a folder-scoped query would
 *  miss it). Fully paged. */
async function getConversationMessages(
  uid: string,
  conversationId: string
): Promise<FolderedMessage[]> {
  const params = new URLSearchParams({
    $filter: `conversationId eq '${conversationId.replace(/'/g, "''")}'`,
    $select: 'id,parentFolderId',
    $top: GRAPH_TOP
  });

  const messages: FolderedMessage[] = [];
  let path: string | undefined = `/me/messages?${params.toString()}`;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const res = await graphGetMain<GraphMessageList>(uid, path);
    if (!res.ok) {
      throw new Error(`Graph list conversation messages failed (${res.status ?? '?'})`);
    }
    for (const message of res.data?.value ?? []) {
      if (message.id) messages.push({ id: message.id, parentFolderId: message.parentFolderId });
    }
    path = res.data?.['@odata.nextLink'];
  }
  return messages;
}

// Per-uid ids of the folders selectMessagesToMove decides by, cached once all
// resolved (a folder the mailbox doesn't have is a 404). Any other failure
// throws, so a move never runs on a guess.
const moveFolderIdsByUid = new Map<string, MoveFolderIds>();

async function getMoveFolderIds(uid: string): Promise<MoveFolderIds> {
  const cached = moveFolderIdsByUid.get(uid);
  if (cached) return cached;
  const ids: MoveFolderIds = {};
  await Promise.all(
    MOVE_FOLDERS.map(async (name) => {
      const res = await graphGetMain<{ id?: string }>(uid, `/me/mailFolders/${name}?$select=id`);
      if (res.ok && res.data?.id) ids[name] = res.data.id;
      else if (res.status !== 404) {
        throw new Error(`Graph folder lookup for ${name} failed (${res.status ?? '?'})`);
      }
    })
  );
  moveFolderIdsByUid.set(uid, ids);
  return ids;
}

async function moveMessages(uid: string, ids: string[], destinationId: string): Promise<void> {
  // A Graph /move returns the message under the SAME immutable id (A1), so
  // cached ids stay valid.
  for (const id of ids) {
    const res = await graphPostMain(uid, `/me/messages/${encodeURIComponent(id)}/move`, {
      destinationId
    });
    if (!res.ok) {
      throw new Error(`Graph move to ${destinationId} failed (${res.status ?? '?'})`);
    }
  }
}

/**
 * Take a conversation out of the Inbox (snooze): its Inbox copies move to
 * Archive; the rest stay where they are (your replies in Sent Items, messages
 * already archived — which Exchange would refuse to move again, failing the
 * snooze). Returns the ids it moved, so the snooze can bring back exactly those.
 */
export async function archiveThread(uid: string, conversationId: string): Promise<string[]> {
  const messages = await getConversationMessages(uid, conversationId);
  const ids = selectMessagesToMove(messages, 'archive', [], ['INBOX'], await getMoveFolderIds(uid));
  await moveMessages(uid, ids, 'archive');
  return ids;
}

/**
 * Bring a snoozed / reminded conversation back to the Inbox: its archived and
 * filed copies (not Sent Items, Drafts, Deleted Items or Junk), or, given the
 * ids a snooze moved, just those of them. Copies already in the Inbox are left
 * alone: Exchange refuses a move into a message's own folder, which failed the
 * restore (and its retry every sweep) whenever a reply had arrived meanwhile.
 */
export async function restoreThreadToInbox(
  uid: string,
  conversationId: string,
  messageIds?: string[]
): Promise<void> {
  const messages = await getConversationMessages(uid, conversationId);
  const back = selectMessagesToMove(messages, 'inbox', ['INBOX'], [], await getMoveFolderIds(uid));
  const ids = messageIds ? back.filter((id) => messageIds.includes(id)) : back;
  await moveMessages(uid, ids, 'inbox');
}
