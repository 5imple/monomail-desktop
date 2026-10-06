import { gmailApiClient } from '@/main/api/apiClient';
import { IMonoThread } from '@/main/models/thread/MonoThread';
import {
  transformThread,
  RawGmailMessage,
  RawGmailThread,
  RawGmailThreadListResponse
} from '@/main/api/mail/transforms';

export interface MailThreadListResponse {
  threads: IMonoThread[];
  nextPageToken?: string;
}

export type MailThreadGetResponse = IMonoThread;

/**
 * Receives a first, partial thread while getThread is still fetching: every
 * message's metadata plus the full body of the newest one (the only message
 * the reader expands). getThread awaits it before fetching the rest, so the
 * full result always lands after the partial one.
 */
export type ThreadPartialCallback = (partial: MailThreadGetResponse) => void | Promise<void>;

// Gmail expects metadataHeaders as repeated query params, not a comma list.
const METADATA_HEADERS = ['Subject', 'From', 'To', 'Cc', 'Bcc', 'Date', 'List-Unsubscribe'];

function buildMetadataParams(): string {
  const params = new URLSearchParams({ format: 'metadata' });
  METADATA_HEADERS.forEach((header) => params.append('metadataHeaders', header));
  return params.toString();
}

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
        .get<RawGmailThread>(`/threads/${stub.id}?${buildMetadataParams()}`, {
          signal,
          uid,
          idToken
        })
        .then((t) => transformThread(t, uid))
        .catch(
          (): IMonoThread => ({
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
            items: []
          })
        )
    )
  );

  return { threads, nextPageToken: listResp.nextPageToken };
};

// Threads at least this long get a newest-message-first partial result.
const PROGRESSIVE_MIN_MESSAGES = 3;

const getThread = async (
  uid: string,
  id: string,
  signal?: AbortSignal,
  onPartial?: ThreadPartialCallback
): Promise<MailThreadGetResponse> => {
  // The complete thread. Started immediately and never delayed by the partial
  // pass below.
  let fullSettled = false;
  const fullThread = gmailApiClient
    .get<RawGmailThread>(`/threads/${id}?format=full`, { signal, uid })
    .then((raw) => transformThread(raw, uid))
    .finally(() => {
      fullSettled = true;
    });

  // Partial pass, in parallel. Long threads quote their whole history in every
  // reply, so format=full can be megabytes: fetch metadata plus only the newest
  // message in full (the one the reader expands) and hand that over first if
  // the full fetch is still out. Best-effort — failures are ignored.
  const partialDelivered = onPartial
    ? (async () => {
        try {
          const light = await gmailApiClient.get<RawGmailThread>(
            `/threads/${id}?${buildMetadataParams()}`,
            { signal, uid }
          );
          const messages = light.messages ?? [];
          if (fullSettled || messages.length < PROGRESSIVE_MIN_MESSAGES) return;
          const newest = messages.reduce((latest, message) =>
            Number(message.internalDate ?? 0) >= Number(latest.internalDate ?? 0) ? message : latest
          );
          const fullNewest = await gmailApiClient.get<RawGmailMessage>(
            `/messages/${newest.id}?format=full`,
            { signal, uid }
          );
          if (fullSettled) return;
          await onPartial(
            transformThread(
              { ...light, messages: messages.map((m) => (m.id === newest.id ? fullNewest : m)) },
              uid
            )
          );
        } catch {
          // Best-effort (see above).
        }
      })()
    : undefined;

  const result = await fullThread;
  // A partial already being applied must finish first, so the caller's update
  // with the full thread always lands last.
  await partialDelivered;
  return result;
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

const trashThread = async (uid: string, id: string, signal?: AbortSignal): Promise<void> => {
  await gmailApiClient.post<void>(`/threads/${id}/trash`, undefined, { uid, signal });
};

const untrashThread = async (uid: string, id: string, signal?: AbortSignal): Promise<void> => {
  await gmailApiClient.post<void>(`/threads/${id}/untrash`, undefined, { uid, signal });
};

const batchModifyThreads = async (
  uid: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  // Gmail has no `/threads/batchModify` endpoint — only `/messages/batchModify`,
  // which expects message IDs, not thread IDs. Passing thread IDs there either
  // 404s or silently no-ops, so multi-select archive/trash never actually
  // applied. Fan out parallel `threads.modify` calls instead.
  await Promise.all(
    ids.map((id) =>
      gmailApiClient.post<void>(
        `/threads/${id}/modify`,
        { addLabelIds, removeLabelIds },
        { uid, signal }
      )
    )
  );
};

export default {
  getThreads,
  getThread,
  trashThread,
  untrashThread,
  modifyThread,
  batchModifyThreads
};
