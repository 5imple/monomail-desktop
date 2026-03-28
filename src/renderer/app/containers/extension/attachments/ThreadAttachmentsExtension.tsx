import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoAttachment } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AttachmentGridItem from '@/renderer/app/components/mail/attachment/AttachmentGridItem';
import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import Loader from '@/renderer/app/components/ui/loader';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/renderer/app/components/ui/tabs';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ThreadAttachmentsExtensionProps {}

export function ThreadAttachmentsExtension({}: ThreadAttachmentsExtensionProps) {
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const { selectedThreads, threadsMap, setSelectedThreads } = useThreadAtom();
  const [threadAttachments, setThreadAttachments] = useState<
    Record<
      string,
      {
        thread: MonoThread;
        attachments: MonoAttachment[];
      }
    >
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { searchNewQuery } = useGlobalAtom();
  const { trackEvent } = useUserTrackingData();

  // Filter constants
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const fileFilters = {
    all: { label: 'All', filter: () => true },
    images: {
      label: 'Images',
      filter: (attachment: MonoAttachment) => attachment.mimeType.includes('image')
    },
    documents: {
      label: 'Documents',
      filter: (attachment: MonoAttachment) =>
        attachment.mimeType.includes('pdf') ||
        attachment.mimeType.includes('word') ||
        attachment.mimeType.includes('doc') ||
        attachment.mimeType.includes('text') ||
        attachment.mimeType.includes('sheet') ||
        attachment.mimeType.includes('excel') ||
        attachment.mimeType.includes('xls')
    },
    media: {
      label: 'Media',
      filter: (attachment: MonoAttachment) =>
        attachment.mimeType.includes('video') || attachment.mimeType.includes('audio')
    }
  };

  // Process threads to get attachments
  useEffect(() => {
    const processThreadAttachments = async () => {
      setIsLoading(true);
      try {
        if (!accounts || accounts.length === 0 || Object.keys(threadsMap).length === 0) {
          setIsLoading(false);
          return;
        }

        const attachmentsMap: Record<
          string,
          {
            thread: MonoThread;
            attachments: MonoAttachment[];
          }
        > = {};

        // Process each thread to extract attachments
        Object.entries(threadsMap).forEach(([threadId, thread]) => {
          // First check thread-level attachments (if any)
          const threadAttachments = Object.values(thread.attachments || {});

          // Then check message-level attachments
          let messageAttachments: MonoAttachment[] = [];

          // Process each message in the thread
          thread.items.forEach((item) => {
            if (item.type === 'message') {
              const message = item as MonoMessage;
              if (message.attachments) {
                const msgAttachments = Object.values(message.attachments);
                if (msgAttachments.length > 0) {
                  messageAttachments = [...messageAttachments, ...msgAttachments];
                }
              }
            }
          });

          // Combine thread and message attachments
          const allAttachments = [...threadAttachments, ...messageAttachments];

          // If there are attachments, add to the map
          if (allAttachments.length > 0) {
            attachmentsMap[threadId] = {
              thread,
              attachments: allAttachments
            };
          }
        });

        setThreadAttachments(attachmentsMap);
        trackEvent('thread_attachments_loaded', {
          count: Object.values(attachmentsMap).reduce(
            (sum, { attachments }) => sum + attachments.length,
            0
          )
        });
      } catch (error) {
        console.error('Error processing thread attachments:', error);
      } finally {
        setIsLoading(false);
      }
    };

    processThreadAttachments();
  }, [threadsMap, accounts]);

  // Handle thread selection
  const handleThreadSelection = (threadId: string) => {
    setSelectedThreads([threadId]);
    trackEvent('thread_selected_from_attachments', { thread_id: threadId });
  };

  // Filter attachments based on selected filter and search term
  const filteredAttachments = Object.entries(threadAttachments).reduce(
    (acc, [threadId, { thread, attachments }]) => {
      const filtered = attachments.filter(
        (attachment) =>
          fileFilters[selectedFilter].filter(attachment) &&
          (searchTerm === '' ||
            attachment.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            thread.subject.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      if (filtered.length > 0) {
        acc[threadId] = {
          thread,
          attachments: filtered
        };
      }
      return acc;
    },
    {} as Record<string, { thread: MonoThread; attachments: MonoAttachment[] }>
  );

  const allAttachments = Object.entries(filteredAttachments).flatMap(
    ([threadId, { thread, attachments }]) =>
      attachments.map((attachment) => ({
        threadId,
        attachment,
        thread,
        uniqueId: attachment.attachmentId
      }))
  );

  // Filter to keep only unique attachments by attachmentId
  const uniqueAttachments = Array.from(
    new Map(allAttachments.map((item) => [item.uniqueId, item])).values()
  );

  // Sort attachments by date (newest first)
  uniqueAttachments.sort((a, b) => b.thread.timestamp - a.thread.timestamp);

  // Function to get message ID for an attachment
  const getMessageIdForAttachment = (threadId: string, attachmentId: string): string => {
    const thread = threadsMap[threadId];

    // Find first message with this attachment
    for (const item of thread.items) {
      if (item.type === 'message') {
        const message = item as MonoMessage;
        if (message.attachments && message.attachments[attachmentId]) {
          return message.id;
        }
      }
    }

    // If not found in messages, return first message ID as fallback
    const firstMessage = thread.items.find((item) => item.type === 'message');
    return firstMessage ? (firstMessage as MonoMessage).id : '';
  };

  return (
    <div className={cn('no-drag relative flex h-full min-w-[320px] flex-col transition-all')}>
      <div className="drag my flex items-center justify-between p-2">
        <div className="text-md ml-2 font-semibold">
          {t('extension.attachments.title', 'Attachments')}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2">
        <Input
          placeholder={t(
            'extension.attachments.search_placeholder',
            'Search by file name or subject'
          )}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
          prepend={<MonoIcon type="Search" className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Filter tabs */}
      <div className="px-3">
        <Tabs defaultValue="all" value={selectedFilter} onValueChange={setSelectedFilter}>
          <TabsList className="w-full">
            {Object.entries(fileFilters).map(([key, { label }]) => (
              <TabsTrigger key={key} value={key} className="flex-1">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader />
          </div>
        ) : Object.keys(threadAttachments).length === 0 ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            {t('extension.attachments.no_loaded_threads', 'No threads with attachments loaded')}
          </div>
        ) : allAttachments.length === 0 ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            {searchTerm
              ? t('extension.attachments.no_matching_attachments', 'No matching attachments found')
              : t(
                  'extension.attachments.no_attachments_found',
                  'No attachments found for the selected filter'
                )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {uniqueAttachments.map(({ threadId, attachment, thread, uniqueId }) => {
              const messageId = getMessageIdForAttachment(threadId, attachment.attachmentId);
              return (
                <div key={uniqueId} className="flex flex-col">
                  <AttachmentGridItem
                    source="message"
                    preview={true}
                    itemId={messageId}
                    accountId={thread.accountId || accounts[0]?.uid}
                    attachment={attachment}
                  />
                  <div
                    className={cn(
                      'mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground hover:text-foreground',
                      selectedThreads.includes(threadId) && 'font-medium text-foreground'
                    )}
                    onClick={() => handleThreadSelection(threadId)}
                  >
                    <div className="p-1">
                      {thread.subject || t('extension.attachments.no_subject', 'No subject')}
                      <div className="">{formatListDate(thread.timestamp)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Search all attachments button */}
      <div className="p-3">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            searchNewQuery('has:attachment', [], false);
            trackEvent('search_all_attachments_clicked');
          }}
        >
          <MonoIcon type="Paperclip" className="mr-2 h-4 w-4" />
          {t('extension.attachments.search_all', 'Search All Attachments')}
        </Button>
      </div>
    </div>
  );
}

export default ThreadAttachmentsExtension;
