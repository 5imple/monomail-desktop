import { messageContent } from '@/main/models/message/bodyData';
import { IMonoMessage } from '@/main/models/message/MonoMessage';

type ExpandableMessage = Pick<
  IMonoMessage,
  'id' | 'labelIds' | 'payload' | 'snippet' | 'attachments' | 'meeting' | 'hasAttachments'
>;

export interface OpenMessages {
  /** Messages the conversation opens with expanded. */
  expanded: Set<string>;
  /** The message the reader scrolls to (null for an empty conversation). */
  focusId: string | null;
}

/**
 * Which messages a conversation opens on: the newest message that has
 * something to read, plus the newest unread one. Not simply the newest by
 * time, which in an Outlook conversation is often an empty "Accepted:" reply
 * (bodyData.messageContent). A message whose content is still unknown (no
 * snippet, body not fetched yet) is chosen only when no message is known to
 * have content. The reader scrolls to the newest unread message when there is
 * one (where reading starts), otherwise to the newest with content.
 *
 * `messages` are in conversation order, oldest first. `unreadIds`: messages
 * unread when the conversation was opened (opening it marks them read, which
 * must not fold them away again); defaults to the UNREAD label.
 */
export function pickOpenMessages(
  messages: ReadonlyArray<ExpandableMessage>,
  unreadIds?: ReadonlySet<string>
): OpenMessages {
  if (messages.length === 0) return { expanded: new Set(), focusId: null };

  let newestWithContent: ExpandableMessage | null = null;
  let newestUnknown: ExpandableMessage | null = null;
  let newestUnread: ExpandableMessage | null = null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const content = messageContent(message);
    if (content === 'empty') continue;
    if (content === 'content' && !newestWithContent) newestWithContent = message;
    if (content === 'unknown' && !newestUnknown) newestUnknown = message;
    const unread = unreadIds ? unreadIds.has(message.id) : message.labelIds.includes('UNREAD');
    if (unread && !newestUnread) newestUnread = message;
    if (newestWithContent && newestUnread) break;
  }

  const main = newestWithContent ?? newestUnknown ?? messages[messages.length - 1];
  const expanded = new Set([main.id]);
  if (newestUnread) expanded.add(newestUnread.id);
  return { expanded, focusId: (newestUnread ?? main).id };
}
