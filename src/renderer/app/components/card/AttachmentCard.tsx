import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoRecipient, MonoAttachment } from '@/main/models/types';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { Button } from '@/renderer/app/components/ui/button';
import AttachmentGridItem from '@/renderer/app/components/mail/attachment/AttachmentGridItem';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { DBGetTargetThread, DBGetThread } from '@/renderer/app/lib/db/thread';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { cn } from '@/renderer/app/lib/utils';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useTranslation } from 'react-i18next';
import React, { memo, useEffect, useState } from 'react';
import { DBGetMessage } from '@/renderer/app/lib/db/message';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import mailApi from '@/main/api/mail/mailApi';
import { toast } from 'sonner';

interface AttachmentCardProps {
  selectedRecipient: MonoRecipient | null;
  thread: MonoThread | null;
}

export const AttachmentCard = memo(function AttachmentCard({
  selectedRecipient,
  thread
}: AttachmentCardProps) {
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const { activeThreadId, selectedThreads, threadsMap, setThreadsMap, setActiveThreadId } =
    useThreadAtom();
  const { addThread } = useThreadOperationAtom();
  const { trackEvent } = useUserTrackingData();
  const { searchNewQuery } = useGlobalAtom();

  // State for view mode

  // State for attachments - combine into single array grouped by thread
  const [attachmentsByThread, setAttachmentsByThread] = useState<
    Array<{
      attachment: MonoAttachment;
      thread: MonoThread;
      messageId: string;
    }>
  >([]);

  const [threadsFromSource, setThreadsFromSource] = useState<Record<string, MonoThread>>({});
  const [threadsFromDomain, setThreadsFromDomain] = useState<Record<string, MonoThread>>({});

  const selectedRecipientDomain = selectedRecipient?.email?.split('@')[1];

  // Helper function to download attachment
  const handleDownloadAttachment = async (
    attachment: MonoAttachment,
    accountId: string,
    messageId: string
  ) => {
    try {
      trackEvent('attachment_downloaded', {
        attachment_id: attachment.attachmentId,
        file_name: attachment.fileName
      });

      // Get the attachment blob from Gmail API
      const response = await mailApi.getAttachmentDownload(
        accountId,
        messageId,
        attachment.attachmentId,
        attachment.fileName
      );

      // Create blob URL
      const blobUrl = URL.createObjectURL(response);

      // Create an anchor element to trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);

      // toast.success(t('attachment.download_success', 'Attachment downloaded successfully'));
    } catch (error) {
      console.error('Failed to download attachment:', error);
      toast.error(t('attachment.download_error', 'Failed to download attachment'));
    }
  };

  // Helper function to extract attachments from threads
  const extractAttachmentsFromThreads = (threads: Record<string, MonoThread>) => {
    const attachments: Array<{
      attachment: MonoAttachment;
      thread: MonoThread;
      messageId: string;
    }> = [];

    Object.values(threads).forEach((thread) => {
      // Safety check for thread and its items
      if (!thread || !thread.items) return;

      // Iterate through messages directly to get their attachments
      thread.items.forEach((item) => {
        // Ensure item exists and has the expected structure
        if (!item || typeof item !== 'object') return;

        if (item.type === 'message') {
          const message = item as MonoMessage;

          // Check if message has attachments and they're in the expected format
          if (message.attachments && typeof message.attachments === 'object') {
            Object.values(message.attachments).forEach((attachment) => {
              // Validate attachment has required properties
              if (attachment && attachment.attachmentId && attachment.fileName && message.id) {
                // Avoid duplicates by checking if we already have this attachment
                if (
                  !attachments.some((a) => a.attachment.attachmentId === attachment.attachmentId)
                ) {
                  attachments.push({
                    attachment,
                    thread,
                    messageId: message.id
                  });
                }
              }
            });
          }
        }
      });
    });
    // Sort by thread timestamp (newest first)
    return attachments.sort((a, b) => b.thread.timestamp - a.thread.timestamp);
  };

  // Helper function to filter threads to only include ones where the recipient participated
  const filterThreadsByParticipation = (
    threads: MonoThread[],
    recipientEmail: string,
    isDomainFilter: boolean = false
  ) => {
    return threads.filter((thread) => {
      // Get all participants from this thread
      const allParticipants = [
        ...(thread?.from || []),
        ...(thread?.to || []),
        ...(thread?.cc || []),
        ...(thread?.bcc || [])
      ];

      // Filter out user's own accounts
      const externalParticipants = allParticipants.filter(
        (contact) => !accounts.some((account) => account.email === contact.email)
      );

      if (isDomainFilter) {
        // For domain filter, check if any participant has the same domain
        const domain = recipientEmail.split('@')[1];
        return externalParticipants.some(
          (participant) => participant.email.split('@')[1] === domain
        );
      } else {
        // For specific recipient, check if they participated
        return externalParticipants.some((participant) => participant.email === recipientEmail);
      }
    });
  };

  useEffect(() => {
    // Reset attachments when selectedRecipient or thread changes
    setAttachmentsByThread([]);
    setThreadsFromSource({});
    setThreadsFromDomain({});

    if (selectedRecipient && thread?.accountId) {
      // Filter threads from the selected contact only (not domain)
      DBGetTargetThread(thread.accountId, selectedRecipient.email).then((v) => {
        // Filter to only include threads where the recipient actually participated
        const filteredSourceThreads = filterThreadsByParticipation(v, selectedRecipient.email);
        const threadsFromSourceMap = filteredSourceThreads.reduce(
          (prev, curr) => ({ ...prev, [curr.id]: curr }),
          {}
        );
        setThreadsFromSource(threadsFromSourceMap);

        // Collect attachments from source threads only
        const sourceAttachments = extractAttachmentsFromThreads(threadsFromSourceMap);

        // Sort by thread timestamp (newest first) and set attachments
        const sortedAttachments = sourceAttachments.sort(
          (a, b) => b.thread.timestamp - a.thread.timestamp
        );

        setAttachmentsByThread(sortedAttachments);
      });
    }
  }, [thread?.accountId, selectedRecipient, accounts]);

  const renderAttachment = (attachmentData: {
    attachment: MonoAttachment;
    thread: MonoThread;
    messageId: string;
  }) => {
    const { attachment, thread, messageId } = attachmentData;

    // Grid view - original layout with download button
    return (
      <div key={attachment.attachmentId} className="group relative">
        <AttachmentGridItem
          source="message"
          preview={true}
          itemId={messageId}
          accountId={thread.accountId || accounts[0]?.uid}
          attachment={attachment}
          size="sm"
        />
        <Button
          sizeVariant="sm"
          variant="secondary"
          typeVariant={'icon'}
          onClick={() =>
            handleDownloadAttachment(attachment, thread.accountId || accounts[0]?.uid, messageId)
          }
          className="absolute right-2 top-2 p-0 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          <MonoIcon type="Download" className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  const renderThreadWithAttachments = (
    threadId: string,
    threadAttachments: Array<{
      attachment: MonoAttachment;
      thread: MonoThread;
      messageId: string;
    }>
  ) => {
    const thread = threadAttachments[0].thread;

    const handleClickThread = async () => {
      if (!threadsMap[thread.id]) {
        // Get the thread from the API and save it
        const accountId = thread.accountId || accounts[0]?.uid;
        if (accountId) {
          try {
            const fullThread = await DBGetThread(accountId, thread.id);
            if (fullThread) {
              // Save the thread to the store
              await addThread(accountId, fullThread);
              setActiveThreadId(thread.id);
              trackEvent('conversation_selected', { thread_id: thread.id });
            }
          } catch (error) {
            console.error('Failed to get thread:', error);
          }
        }
      } else {
        setActiveThreadId(thread.id);
        trackEvent('conversation_selected', { thread_id: thread.id });
      }
    };

    return (
      <div key={threadId} className="space-y-2">
        {/* Thread subject and date - shown once per thread */}
        <div
          className={cn(
            'cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground hover:text-foreground',
            (activeThreadId === thread.id || selectedThreads.includes(thread.id)) &&
              'font-medium text-foreground'
          )}
          onClick={handleClickThread}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="truncate font-medium">
              {thread.subject || t('extension.contact.no_subject')}
            </div>
            <div className="text-xs">{formatListDate(thread.timestamp)}</div>
          </div>
        </div>

        {/* All attachments from this thread */}
        <div className="grid grid-cols-1 gap-2">{threadAttachments.map(renderAttachment)}</div>
      </div>
    );
  };

  // Don't render anything if no attachments exist
  if (!selectedRecipient || attachmentsByThread.length === 0) {
    return null;
  }

  // TODO: animation memoize this
  return (
    <div className="no-drag relative mt-1 min-w-[320px] space-y-4 rounded-lg border border-border/60 bg-card p-3 shadow-sm duration-500 ease-bouncy-in-out animate-in fade-in-0 slide-in-from-top-8">
      {
        <div>
          <div className="mb-2 flex items-center justify-between">
            {/* Newton gutter label: tracked uppercase mono — signature
                treatment for FROM/TO/SUBJECT/ATTACHMENTS dividers. */}
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('extension.contact.attachments', 'Attachments')}
            </div>
          </div>
          <div className="space-y-3">
            {(() => {
              // Group attachments by thread ID
              const attachmentsByThreadId = attachmentsByThread
                .slice(0, 10) // Show attachments from first 10 most recent threads
                .reduce(
                  (acc, attachment) => {
                    const threadId = attachment.thread.id;
                    if (!acc[threadId]) {
                      acc[threadId] = [];
                    }
                    acc[threadId].push(attachment);
                    return acc;
                  },
                  {} as Record<
                    string,
                    Array<{
                      attachment: MonoAttachment;
                      thread: MonoThread;
                      messageId: string;
                    }>
                  >
                );

              // Render each thread with its attachments
              return Object.entries(attachmentsByThreadId)
                .slice(0, 5) // Show first 5 threads
                .map(([threadId, threadAttachments]) =>
                  renderThreadWithAttachments(threadId, threadAttachments)
                );
            })()}
          </div>
          {attachmentsByThread.length > 10 && (
            <Button
              onClick={() =>
                selectedRecipient &&
                searchNewQuery(
                  `from:${selectedRecipient.email} has:attachment`,
                  selectedThreads,
                  false
                )
              }
              className="mt-2 w-full"
              variant="secondary"
            >
              {t('extension.contact.more)', 'Load more')}
            </Button>
          )}
        </div>
      }
    </div>
  );
});

AttachmentCard.displayName = 'AttachmentCard';
