import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoRecipient } from '@/main/models/types';
import { Button } from '@/renderer/app/components/ui/button';
import { Label } from '@/renderer/app/components/ui/label';
import { ScrollArea, ScrollBar } from '@/renderer/app/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/renderer/app/components/ui/tabs';
import RecipientCard from '@/renderer/app/containers/extension/contact/RecipientCard';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { Contact } from '@/renderer/app/lib/db/contact';
import { DBGetMessage } from '@/renderer/app/lib/db/message';
import { DBGetTargetThread } from '@/renderer/app/lib/db/thread';
import { formatListDate } from '@/renderer/app/lib/formatDate';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import React, { memo, useEffect, useState, useMemo } from 'react';

// Import our custom tracking hook
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useTranslation } from 'react-i18next';

interface ContactCardProps {
  thread: MonoThread | null;
  recipient: MonoRecipient | null;
  onRecipientChange?: (recipient: MonoRecipient | null) => void;
}

// Custom comparison function for memo
const areEqual = (prevProps: ContactCardProps, nextProps: ContactCardProps) => {
  // Compare recipient
  if (prevProps.recipient !== nextProps.recipient) {
    if (!prevProps.recipient || !nextProps.recipient) return false;
    if (prevProps.recipient.email !== nextProps.recipient.email) return false;
  }

  // Compare thread
  if (prevProps.thread !== nextProps.thread) {
    if (!prevProps.thread || !nextProps.thread) return false;
    if (
      prevProps.thread.id !== nextProps.thread.id ||
      prevProps.thread.accountId !== nextProps.thread.accountId ||
      prevProps.thread.timestamp !== nextProps.thread.timestamp
    ) {
      return false;
    }
  }

  // Compare onRecipientChange callback reference
  if (prevProps.onRecipientChange !== nextProps.onRecipientChange) {
    return false;
  }

  return true;
};

export const ContactCard = memo(function ContactCard({
  thread,
  recipient,
  onRecipientChange
}: ContactCardProps) {
  const { t } = useTranslation();
  const { member, accounts } = useAuth();
  const [selectedRecipient, setSelectedRecipient] = useState<MonoRecipient | null>(recipient);
  const [userSelectedRecipient, setUserSelectedRecipient] = useState<boolean>(false);
  const { activeThreadId, selectedThreads, threadsMap, setThreadsMap, setActiveThreadId } =
    useThreadAtom();
  const [threadsFromSource, setThreadsFromSource] = useState<Record<string, MonoThread>>({});
  const [threadsFromDomain, setThreadsFromDomain] = useState<Record<string, MonoThread>>({});

  const { contactArray } = useContactAtom();
  const [filteredContactArray, setFilteredContactArray] = useState<Contact[]>([]);
  const { searchNewQuery } = useGlobalAtom();
  const executeCommand = useExecuteCommand();
  const [searchValue, setSearchValue] = useState<string>('');

  // Combine all contact fields, filter out account emails, and remove duplicates
  const recipientFromThread = useMemo(() => {
    return Array.from(
      new Map(
        [
          ...(thread?.from || []),
          ...(thread?.to || []),
          ...(thread?.cc || []),
          ...(thread?.bcc || [])
        ]
          .filter((contact) => !accounts.some((account) => account.email === contact.email))
          .map((contact) => [contact.email, contact])
      ).values()
    );
  }, [thread?.from, thread?.to, thread?.cc, thread?.bcc, accounts]);
  const selectedRecipientDomain = selectedRecipient?.email?.split('@')[1];

  useEffect(() => {
    if (recipientFromThread.length === 0) {
      setSelectedRecipient(null);
      setUserSelectedRecipient(false);
      return;
    }

    // If there's a recipient prop and it's in the current thread, use it (only if user hasn't manually selected)
    if (
      recipient &&
      recipientFromThread.some((r) => r.email === recipient.email) &&
      !userSelectedRecipient
    ) {
      // setSelectedRecipient(recipient);
      return;
    }

    // If current selected recipient is not in the new thread, or if we don't have one,
    // select the first recipient from the thread (only if user hasn't manually selected or current selection is invalid)

    if (
      !selectedRecipient ||
      !recipientFromThread.some((r) => r.email === selectedRecipient.email)
    ) {
      setSelectedRecipient(recipientFromThread[0]);
      onRecipientChange?.(recipientFromThread[0]);
      setUserSelectedRecipient(false);
    }
  }, [recipientFromThread, recipient, thread?.id]);

  // Reset user selection flag when thread changes
  useEffect(() => {
    setUserSelectedRecipient(false);
  }, [thread?.id]);

  useEffect(() => {
    if (selectedRecipient && thread?.accountId) {
      // Filter threads from the selected contact
      DBGetTargetThread(thread.accountId, selectedRecipient.email).then((v) => {
        const threadsFromSourceMap = v.reduce((prev, curr) => ({ ...prev, [curr.id]: curr }), {});
        setThreadsFromSource(threadsFromSourceMap);

        // Filter threads from the selected domain
        if (selectedRecipientDomain) {
          DBGetTargetThread(thread.accountId, selectedRecipientDomain).then((domainThreads) => {
            const threadsFromDomainMap = domainThreads.reduce(
              (prev, curr) => ({ ...prev, [curr.id]: curr }),
              {}
            );
            setThreadsFromDomain(threadsFromDomainMap);
          });
        }
      });
    }
  }, [threadsMap, thread?.accountId, selectedRecipient, selectedRecipientDomain]);

  const [visibleContactArray, setVisibleContactArray] = useState<Contact[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const batchSize = 100; // Load 100 contacts at a time

  // Use tracking hook
  const { trackEvent } = useUserTrackingData();

  // Filter and initialize the contact array
  useEffect(() => {
    const filtered = searchValue
      ? contactArray.filter((contact) => contact.emailAddress.includes(searchValue))
      : [...contactArray].sort((a, b) => a.displayName.localeCompare(b.displayName));

    setFilteredContactArray(filtered);
    setVisibleContactArray(filtered.slice(0, batchSize));
    setOffset(batchSize);
  }, [searchValue, contactArray]);

  // Load more contacts when the user scrolls to the end
  const handleLoadMore = () => {
    if (offset < filteredContactArray.length) {
      const nextBatch = filteredContactArray.slice(offset, offset + batchSize);
      setVisibleContactArray((prev) => [...prev, ...nextBatch]);
      setOffset((prevOffset) => prevOffset + batchSize);
      trackEvent('contacts_load_more', { newOffset: offset + batchSize });
    }
  };

  // Debounced scroll event handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      handleLoadMore();
    }
  };

  const handleClickRecipient = (recipient: MonoRecipient) => {
    setSelectedRecipient(recipient);
    setUserSelectedRecipient(true);
    onRecipientChange?.(recipient); // Notify parent component
    trackEvent('recipient_selected', { recipient_email: recipient.email });
  };

  const renderConversation = ([key, thread]: [string, MonoThread]) => {
    const handleClickThread = () => {
      if (!threadsMap[key]) {
        // Use the thread's accountId instead of member.uid
        const currentThread = activeThreadId ? threadsMap[activeThreadId] : null;
        if (currentThread?.accountId) {
          DBGetMessage(currentThread.accountId, thread.items[0].id as unknown as string).then(
            (msg) => {
              // @ts-expect-error: items can include msg
              thread.items = [msg];
              setThreadsMap((prev) => ({ ...prev, [key]: thread }));
              setActiveThreadId(key);
              trackEvent('conversation_selected', { thread_id: key });
            }
          );
        }
      } else {
        setActiveThreadId(key);
        trackEvent('conversation_selected', { thread_id: key });
      }
    };

    return (
      <div
        key={key}
        className={cn(
          `flex items-center gap-2 p-2 transition-all`,
          activeThreadId === thread.id || selectedThreads.includes(thread.id) ? 'border-l-0' : ''
        )}
        onClick={handleClickThread}
      >
        <div className="flex-1 overflow-hidden">
          <div className="overflow-hidden text-ellipsis">
            <span
              className={cn(
                'whitespace-nowrap text-sm',
                (activeThreadId === thread.id || selectedThreads.includes(thread.id)) &&
                  'font-semibold'
              )}
            >
              {thread.subject.length > 0 ? thread.subject : t('extension.contact.no_subject')}
            </span>
          </div>
        </div>
        <div className="flex-0 shrink-0 whitespace-nowrap text-end text-xs text-muted-foreground">
          {formatListDate(thread.timestamp)
            .split('at')[0]
            .trim()
            .replace(/(yesterday).*/, '$1')}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'no-drag relative flex h-full min-w-[320px] flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm transition-all'
      )}
    >
      {/* <div className="my flex items-center justify-between p-2">
        <div className="text-md ml-2 font-semibold">{t('extension.contact.title')}</div>
        <div className="h-10"></div>
      </div> */}
      {!thread || !selectedRecipient ? (
        <div className="p-3 text-center text-sm text-muted-foreground">
          {t('extension.contact.no_selected_conversation')}
        </div>
      ) : (
        <>
          {recipientFromThread.length > 1 && (
            <div className="">
              <ScrollArea className="p-3 pb-0">
                <div className="flex gap-2">
                  {recipientFromThread.map((recipient) => (
                    <button
                      className={cn(
                        'max-w-32 px-2 py-1 text-sm text-muted-foreground',
                        recipient.email === selectedRecipient?.email &&
                          'rounded-md bg-muted-low/60 font-medium text-foreground dark:bg-foreground/10'
                        // buttonVariants({ variant: 'ghost', className: 'h-8 px-2 py-1' })
                        // 'rounded-md bg-card font-medium text-foreground',
                      )}
                      key={recipient.email}
                      onClick={() => handleClickRecipient(recipient)}
                    >
                      <div className="overflow-hidden text-ellipsis">
                        <span className="whitespace-nowrap text-sm font-medium">
                          {recipient.name.length
                            ? recipient.name.split(' ')[0].split('@')[0]
                            : recipient.email.split(' ')[0].split('@')[0]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}
          <div className="p-3">
            {selectedRecipient && <RecipientCard recipient={selectedRecipient} />}
          </div>
          <div className="flex-1 p-3">
            <Label className="mb-3 line-clamp-1">
              {t('extension.contact.latest_conversations')}
            </Label>
            <Tabs defaultValue="name">
              <div className="flex items-center">
                <TabsList className="ml-auto w-full">
                  <TabsTrigger value="name" className="w-[50%] justify-start">
                    <div className="overflow-hidden text-ellipsis">
                      <span className="whitespace-nowrap">
                        {selectedRecipient?.email.split('@')[0]}
                      </span>
                    </div>
                  </TabsTrigger>
                  <TabsTrigger value="domain" className="w-[50%] justify-start">
                    <div className="overflow-hidden text-ellipsis">
                      <span className="whitespace-nowrap">
                        @{selectedRecipient?.email.split('@')[1]}
                      </span>
                    </div>
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="name">
                <div className="mt-1 flex flex-col justify-center gap-1">
                  {React.Children.toArray(
                    Object.entries(threadsFromSource).reverse().slice(0, 5).map(renderConversation)
                  )}
                  {Object.keys(threadsFromSource).length > 5 && (
                    <Button
                      onClick={() =>
                        selectedRecipient &&
                        searchNewQuery(`from:${selectedRecipient.email}`, selectedThreads, false)
                      }
                      className="w-full"
                      variant="secondary"
                    >
                      {t('extension.contact.load_more')}
                    </Button>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="domain">
                <div className="mt-1 flex flex-col justify-center gap-1">
                  {React.Children.toArray(
                    Object.entries(threadsFromDomain).reverse().slice(0, 5).map(renderConversation)
                  )}
                  {Object.keys(threadsFromDomain).length > 5 && (
                    <Button
                      onClick={() =>
                        selectedRecipient &&
                        searchNewQuery(
                          `from:${selectedRecipient.email.split('@')[1]}`,
                          selectedThreads,
                          false
                        )
                      }
                      className="w-full"
                      variant="secondary"
                    >
                      {t('extension.contact.load_more')}
                    </Button>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </div>
  );
}, areEqual);

// For backward compatibility, if the component was imported without destructuring
ContactCard.displayName = 'ContactCard';
