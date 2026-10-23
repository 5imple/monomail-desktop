/**
 * Whether a Graph or Gmail request the app made changed which mail is where:
 * a send, reply, forward, move, delete, archive. The window then refreshes
 * its list quietly (mailChangeNotifier), so a sent reply shows in its
 * conversation and nothing waits for the refresh button.
 *
 * Read/star/flag changes and draft saves don't count: the list shows them at
 * once already, and a draft autosaves every few seconds.
 */

const pathOf = (url: string) => {
  const noQuery = url.split('?')[0].toLowerCase();
  return noQuery.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
};

const GRAPH_ACTIONS = /\/messages\/[^/]+\/(move|copy|send|reply|replyall|forward)$/;

export function isGraphMailMutation(method: string, url: string): boolean {
  const verb = method.toUpperCase();
  const path = pathOf(url);
  if (verb === 'DELETE') return /\/messages\/[^/]+$/.test(path);
  if (verb !== 'POST') return false;
  return path.endsWith('/sendmail') || GRAPH_ACTIONS.test(path);
}

// Label changes that only mark read / starred / important.
const QUIET_GMAIL_LABELS = new Set(['UNREAD', 'STARRED', 'IMPORTANT']);

function onlyQuietLabels(body: string | undefined): boolean {
  if (!body) return false;
  try {
    const { addLabelIds = [], removeLabelIds = [] } = JSON.parse(body) as {
      addLabelIds?: string[];
      removeLabelIds?: string[];
    };
    const labels = [...addLabelIds, ...removeLabelIds];
    return labels.length > 0 && labels.every((label) => QUIET_GMAIL_LABELS.has(label));
  } catch {
    return false;
  }
}

export function isGmailMailMutation(method: string, url: string, body?: string): boolean {
  const verb = method.toUpperCase();
  const path = pathOf(url);
  if (!path.includes('/gmail/v1/users/')) return false;
  if (verb === 'DELETE') return /\/(threads|messages)\/[^/]+$/.test(path);
  if (verb !== 'POST') return false;
  if (/\/(messages|drafts)\/send$/.test(path)) return true;
  if (/\/(threads|messages)\/[^/]+\/(trash|untrash)$/.test(path)) return true;
  if (/\/(threads|messages)\/[^/]+\/modify$/.test(path) || path.endsWith('/messages/batchmodify')) {
    return !onlyQuietLabels(body);
  }
  return false;
}
