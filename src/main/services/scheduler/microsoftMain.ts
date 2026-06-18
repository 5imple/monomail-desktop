import { graphGetMain, graphPostMain } from '@/main/services/push/graphFetchMain';

// Microsoft Graph mail moves made directly from the main process (for the
// scheduler, which fires when the renderer window may be closed). The
// renderer/worker microsoftMailProvider uses graphApiClient/graphBatch, which
// only run inside a renderer — so the scheduler needs this main-native path,
// mirroring the provider's conversationId -> /move semantics via graphFetchMain.

const GRAPH_TOP = '50';
const MAX_PAGES = 20;

interface GraphMessageList {
  value?: { id: string }[];
  '@odata.nextLink'?: string;
}

/** All message ids of a conversation, across folders (a snoozed/reminded thread
 *  was moved to Archive, so a folder-scoped query would miss it). Fully paged. */
async function getConversationMessageIds(uid: string, conversationId: string): Promise<string[]> {
  const params = new URLSearchParams({
    $filter: `conversationId eq '${conversationId.replace(/'/g, "''")}'`,
    $select: 'id',
    $top: GRAPH_TOP
  });

  const ids: string[] = [];
  let path: string | undefined = `/me/messages?${params.toString()}`;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const res = await graphGetMain<GraphMessageList>(uid, path);
    if (!res.ok) {
      throw new Error(`Graph list conversation messages failed (${res.status ?? '?'})`);
    }
    for (const message of res.data?.value ?? []) {
      if (message.id) ids.push(message.id);
    }
    path = res.data?.['@odata.nextLink'];
  }
  return ids;
}

/**
 * Move every message of a conversation into a well-known folder ('inbox',
 * 'archive', ...). A Graph /move returns the message under the SAME immutable id
 * (A1), so cached ids stay valid. Used to restore a reminded thread to the inbox.
 */
export async function moveThreadToFolder(
  uid: string,
  conversationId: string,
  destinationId: string
): Promise<void> {
  const ids = await getConversationMessageIds(uid, conversationId);
  for (const id of ids) {
    const res = await graphPostMain(uid, `/me/messages/${encodeURIComponent(id)}/move`, {
      destinationId
    });
    if (!res.ok) {
      throw new Error(`Graph move to ${destinationId} failed (${res.status ?? '?'})`);
    }
  }
}

/** Restore a reminded/snoozed conversation to the Inbox folder. */
export async function restoreThreadToInbox(uid: string, conversationId: string): Promise<void> {
  await moveThreadToFolder(uid, conversationId, 'inbox');
}
