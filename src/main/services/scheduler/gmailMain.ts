import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { net } from 'electron';

// Authed Gmail calls made directly from the main process (for the scheduler,
// which fires when the renderer window may be closed). Mirrors the token +
// net.fetch approach used by the gmail IPC handler and the history poller —
// `mailApi`/`gmailApiClient` are renderer-oriented and don't inject tokens here.

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function authedFetch<T = unknown>(
  uid: string,
  path: string,
  init?: { method?: string; body?: string }
): Promise<T | null> {
  const { accessToken } = await tokenManager.getGoogleAccountAccessToken(uid);
  const res = await net.fetch(`${GMAIL_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: init?.body
  });
  if (!res.ok) {
    throw new Error(`Gmail ${init?.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

/** Add/remove labels on a thread (e.g. snooze = remove INBOX, add Snoozed). */
export async function modifyThread(
  uid: string,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await authedFetch(uid, `/threads/${threadId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds })
  });
}

interface GmailLabel {
  id: string;
  name: string;
}

/** Find a user label by name, creating it if it doesn't exist. Returns its id. */
export async function findOrCreateLabel(uid: string, name: string): Promise<string> {
  const list = await authedFetch<{ labels?: GmailLabel[] }>(uid, '/labels');
  const existing = list?.labels?.find((label) => label.name === name);
  if (existing) return existing.id;

  const created = await authedFetch<GmailLabel>(uid, '/labels', {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    })
  });
  if (!created?.id) throw new Error(`Failed to create label "${name}"`);
  return created.id;
}

/** Send a base64url RFC822 message (scheduled send). */
export async function sendRawMessage(
  uid: string,
  raw: string,
  threadId?: string
): Promise<{ id: string; threadId: string }> {
  const sent = await authedFetch<{ id: string; threadId: string }>(uid, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) })
  });
  if (!sent?.id) throw new Error('messages.send returned no id');
  return sent;
}
