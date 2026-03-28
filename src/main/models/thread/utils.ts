import { GmailMessage, GmailThreadGetResponse } from '@/main/api/gmail/types';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';

export const parseGmailThread = (accountId: string, thread: GmailThreadGetResponse): MonoThread => {
  // Helper function to get unique recipients
  const uniqueRecipients = (
    messages: GmailMessage[],
    field: keyof GmailMessage
  ): MonoRecipient[] => {
    const recipientSet = new Set<string>();
    const recipients: MonoRecipient[] = [];

    messages.forEach((message) => {
      if (field === 'from') {
        // Handle 'from' as a single recipient
        const from = message.from;
        if (from) {
          const key = `${from.name} <${from.email}>`;
          if (!recipientSet.has(key)) {
            recipientSet.add(key);
            recipients.push(from);
          }
        }
      } else if (field === 'to' || field === 'cc' || field === 'bcc') {
        // Handle array fields explicitly
        const recipientArray = message[field] as MonoRecipient[];
        if (Array.isArray(recipientArray)) {
          recipientArray.forEach((recipient) => {
            if (recipient) {
              const key = `${recipient.name} <${recipient.email}>`;
              if (!recipientSet.has(key)) {
                recipientSet.add(key);
                recipients.push(recipient);
              }
            }
          });
        }
      }
    });

    return recipients;
  };

  // Aggregate label IDs
  const aggregatedLabelIds = Array.from(new Set(thread.messages.flatMap((msg) => msg.labelIds)));

  // Aggregate attachments
  const aggregatedAttachments = thread.messages.reduce(
    (acc, msg) => {
      return { ...acc, ...msg.attachments };
    },
    {} as Record<string, MonoAttachment>
  );

  // Parse messages into MonoMessage
  const parsedMessages = thread.messages.map((message) => MonoMessage.fromGmailMessage(message));

  return new MonoThread({
    accountId: accountId,
    id: thread.id,
    historyId: thread.historyId,
    labelIds: aggregatedLabelIds,
    attachments: aggregatedAttachments,
    from: uniqueRecipients(thread.messages, 'from'),
    bcc: uniqueRecipients(thread.messages, 'bcc'),
    cc: uniqueRecipients(thread.messages, 'cc'),
    to: uniqueRecipients(thread.messages, 'to'),
    subject: thread.subject,
    snippet: thread.snippet,
    timestamp: thread.timestamp,
    items: parsedMessages
  });
};
