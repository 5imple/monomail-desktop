import { gmailApiClient } from '@/main/api/apiClient';
import { IMonoThread } from '@/main/models/thread/MonoThread';
import {
  transformThread,
  RawGmailThread,
  RawGmailThreadListResponse,
} from '@/main/api/mail/transforms';

export interface MailThreadListResponse {
  threads: IMonoThread[];
  nextPageToken?: string;
}

export type MailThreadGetResponse = IMonoThread;

// Metadata headers requested for thread list — enough for list display without
// downloading message bodies.
const METADATA_HEADERS = 'Subject,From,To,Date,List-Unsubscribe';

const getThreads = async (
  uid: string,
  q: string,
  pageToken?: string,
  maxResults?: string,
  signal?: AbortSignal,
  idToken?: string
): Promise<MailThreadListResponse> => {
  const params = new URLSearchParams({ q });
  if (pageToken) params.set('pageToken', pageToken);
  if (maxResults) params.set('maxResults', maxResults);

  const listResp = await gmailApiClient.get<RawGmailThreadListResponse>(
    `/threads?${params.toString()}`,
    { signal, uid, idToken }
  );

  const stubs = listResp.threads ?? [];
  if (stubs.length === 0) {
    return { threads: [], nextPageToken: listResp.nextPageToken };
  }

  // Parallel metadata fetches — lightweight (headers only, no body data)
  const threads = await Promise.all(
    stubs.map((stub) =>
      gmailApiClient
        .get<RawGmailThread>(
          `/threads/${stub.id}?format=metadata&metadataHeaders=${METADATA_HEADERS}`,
          { signal, uid, idToken }
        )
        .then((t) => transformThread(t, uid))
        .catch((): IMonoThread => ({
          accountId: uid,
          id: stub.id,
          historyId: stub.historyId ?? null,
          labelIds: [],
          attachments: {},
          from: [],
          to: [],
          cc: [],
          bcc: [],
          subject: '',
          snippet: stub.snippet ?? '',
          timestamp: Date.now(),
          items: [],
        }))
    )
  );

  return { threads, nextPageToken: listResp.nextPageToken };
};

const getThread = async (
  uid: string,
  id: string,
  signal?: AbortSignal
): Promise<MailThreadGetResponse> => {
  const raw = await gmailApiClient.get<RawGmailThread>(`/threads/${id}?format=full`, {
    signal,
    uid,
  });
  return transformThread(raw, uid);
};

const modifyThread = async (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  await gmailApiClient.post<void>(
    `/threads/${id}/modify`,
    { addLabelIds, removeLabelIds },
    { uid, signal }
  );
};

const batchModifyThreads = async (
  uid: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  await gmailApiClient.post<void>(
    '/messages/batchModify',
    { ids, addLabelIds, removeLabelIds },
    { uid, signal }
  );
};

export default {
  getThreads,
  getThread,
  modifyThread,
  batchModifyThreads,
};
