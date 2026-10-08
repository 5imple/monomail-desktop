import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import ThreadItemContextMenu from '@/renderer/app/components/mail/thread/ThreadItemContextMenu';
import {
  rowAvatarRecipient,
  stripExternalBanner,
  ThreadRowMeta,
  ThreadSenderNames
} from '@/renderer/app/components/mail/thread/ThreadRowParts';
import { useThreadReadMotion } from '@/renderer/app/components/mail/thread/useThreadReadMotion';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';
import { cn } from '@/renderer/app/lib/utils';
import { setSelectionAnchor } from '@/renderer/app/store/thread/threadRangeSelection';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLabelQuery } from '@/renderer/app/lib/queryUtils';

interface ThreadListDenseItemProps {
  threadId: string;
  onClick: (e: React.MouseEvent, id: string) => void;
  index?: number;
}

export const ThreadListDenseItem = React.memo(
  React.forwardRef<HTMLDivElement, ThreadListDenseItemProps>(
    ({ threadId, onClick }, forwardedRef) => {
      const [isRendering, setIsRendering] = useState(false);
      // Start fully visible so the first screenful paints at once. This used to
      // begin at 0 and fade to 100 per row; staggered by list index, that read as
      // a left-to-right "sweep" as the inbox loaded. The IntersectionObserver still
      // gates content rendering (isRendering) for long-list virtualization.
      const [opacity, setOpacity] = useState(100);
      const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
      const { accounts } = useAuth();
      const memoizedSearchQuery = useCallback(searchNewQuery, [searchNewQuery]);

      const { labelsMapByAccount } = useLabelAtom();
      const { activeThreadId, threadsMap, selectedThreads, setSelectedThreads } = useThreadAtom();
      const containerRef = useRef<HTMLDivElement | null>(null);
      // Last measured height; the default approximates a rendered row.
      const placeholderHeightRef = useRef<number | null>(null);
      const itemRef = useRef<HTMLDivElement | null>(null);
      const hasBeenVisibleRef = useRef(false);
      const lastThreadRef = useRef<MonoThread | null>(null);

      // Use direct access to thread instead of memoizing to ensure we always have latest data
      const liveThread = threadsMap[threadId] ?? null;
      if (liveThread) lastThreadRef.current = liveThread;
      const currentThread = liveThread ?? lastThreadRef.current;

      const senderAvatarRecipient = useMemo(
        () =>
          currentThread ? rowAvatarRecipient(currentThread, accounts) : { email: '', name: '' },
        [currentThread, accounts]
      );

      const senderAccountImageSrc = useMemo(() => {
        const senderEmail = senderAvatarRecipient.email.trim().toLowerCase();
        if (!senderEmail) return null;

        return (
          accounts.find((account) => account.email.trim().toLowerCase() === senderEmail)
            ?.profileImageUrl ?? null
        );
      }, [accounts, senderAvatarRecipient.email]);

      const highlightedContent = useMemo(() => {
        if (!currentThread || !globalSearchQuery) {
          return {
            subject: null,
            snippet: null
          };
        }

        const snippet = stripExternalBanner(currentThread.snippet);
        return {
          subject: highlightThreadText(
            !currentThread.subject || currentThread.subject === ''
              ? '(No subject)'
              : currentThread.subject,
            globalSearchQuery
          ),
          snippet: snippet ? highlightThreadText(snippet, globalSearchQuery) : null
        };
      }, [currentThread?.subject, currentThread?.snippet, globalSearchQuery]);

      const { registerItem, unregisterItem } = useKeyboardNavigationContext();

      const accountLabels = useMemo(
        () => (currentThread ? labelsMapByAccount[currentThread.accountId] || {} : {}),
        [currentThread?.accountId, labelsMapByAccount]
      );

      // Combine refs to handle both forwarded ref and internal ref
      const setRefs = useCallback(
        (node: HTMLDivElement | null) => {
          itemRef.current = node;

          // Handle forwarded ref
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        },
        [forwardedRef]
      );

      // Re-created only when the row itself appears/changes id — keyed on the
      // whole thread it re-registered (and moved to the end of the keyboard
      // list) on every update of that thread.
      const hasThread = !!currentThread;
      useEffect(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                if (lastThreadRef.current) {
                  setIsRendering(true);
                }
              } else {
                // Keep the row's real height for its placeholder so the list
                // doesn't shrink (and the scroll position jump) off-screen.
                if (containerRef.current?.offsetHeight) {
                  placeholderHeightRef.current = containerRef.current.offsetHeight;
                }
                setIsRendering(false);
              }
            });
          },
          {
            root: document.getElementById('thread-list-scroll-root'),
            threshold: 0, // Trigger as soon as it intersects
            rootMargin: '210px 0px 210px 0px' // Trigger 50px before it enters the viewport
          }
        );

        if (containerRef.current) {
          observer.observe(containerRef.current);
        }

        // Register the actual interactive element for keyboard navigation
        if (containerRef.current) {
          registerItem('thread-list', threadId, containerRef.current);
        }

        return () => {
          observer.disconnect();
          unregisterItem('thread-list', threadId);
        };
      }, [threadId, hasThread]);

      useEffect(() => {
        // Never drop opacity back to 0 when a row leaves the viewport: isRendering
        // already gates content for virtualization, and re-fading on re-entry made
        // the inbox fade in again when returning from the reader.
        if (isRendering) {
          requestAnimationFrame(() => setOpacity(100));
        }
      }, [isRendering]);

      useEffect(() => {
        if (opacity === 100) hasBeenVisibleRef.current = true;
      }, [opacity]);

      const handleClick = useCallback(
        (e: React.MouseEvent | React.KeyboardEvent) => {
          if (
            e.nativeEvent instanceof KeyboardEvent &&
            (e.nativeEvent.key !== 'Enter' || e.nativeEvent.metaKey) &&
            e.nativeEvent.key !== ' '
          ) {
            return;
          }
          if (currentThread) onClick(e as React.MouseEvent, currentThread.id);
        },
        [onClick, currentThread]
      );

      const isUnread = currentThread?.labelIds.includes('UNREAD') ?? false;
      const isChecked = selectedThreads.includes(threadId);
      const isActive = activeThreadId === threadId;
      const readMotion = useThreadReadMotion(threadId, currentThread ? isUnread : null, isActive);

      // Done/Trash deletes the thread from threadsMap while its id can still be
      // in the rendered id list for a frame. The JSX below dereferences
      // currentThread.items/.id/etc. unguarded, so without this early return a
      // single stale id throws mid-render and unmounts the whole list — every
      // email vanishes until a refetch. Render nothing for a missing thread.
      if (!currentThread) return null;

      return (
        <div
          ref={containerRef}
          onClick={handleClick}
          aria-current={isActive ? 'true' : undefined}
          aria-pressed={isChecked}
          data-thread={threadId}
          data-thread-focused={isActive}
          data-read-motion={readMotion ?? undefined}
          data-thread-selected={isChecked}
          tabIndex={0}
          role="button"
          className={cn(
            'group relative mx-[10%] overflow-hidden rounded-md outline-none transition-colors transition-opacity duration-150 duration-200 ease-out',
            isChecked
              ? '!bg-selection/[0.08] ring-1 ring-inset ring-selection/25 pointer-hover:!bg-selection/[0.12] dark:!bg-selection/[0.15] dark:ring-selection/30 dark:pointer-hover:!bg-selection/[0.2]'
              : isActive
                ? 'bg-foreground/[0.07] ring-1 ring-inset ring-foreground/10 hover:bg-foreground/[0.07] dark:bg-foreground/[0.12] dark:ring-foreground/15 dark:hover:bg-foreground/[0.12]'
                : 'bg-card pointer-hover:bg-foreground/[0.045] dark:pointer-hover:bg-foreground/[0.07]',
            currentThread && !isUnread && 'text-muted-foreground',
            opacity == 0 ? 'opacity-0' : 'opacity-100',
            !currentThread && 'hidden'
          )}
        >
          {!currentThread || !isRendering ? (
            <div
              className="transition-[height] duration-200 ease-bouncy-in-out"
              style={{ height: placeholderHeightRef.current ?? 33 }}
            />
          ) : (
            <ThreadItemContextMenu thread={currentThread}>
              <div className="relative">
                {isChecked && (
                  <span
                    aria-hidden
                    className="absolute inset-y-[3px] left-0 z-20 w-[3px] rounded-r-full bg-selection"
                  />
                )}
                {/* Unread is indicated by the bold font only — no left accent bar. */}
                {/* The divider sits on the wrapper so a line of attachment chips
                    stays inside its own row instead of under the next one. */}
                <div
                  ref={setRefs}
                  className={cn('border-b border-border/40 text-left text-sm transition-colors')}
                >
                  {/* Compact row: one line, 24px avatar, py-1 — about 37px tall
                      (comfortable is ~49px), so more mail fits per screen. */}
                  <div className={cn('flex items-center gap-3 px-3 py-1')}>
                    {/* Unread dot + hover checkbox share the same slot: an unread
                        row shows the blue dot here at rest; on hover the checkbox
                        takes over (hover behavior unchanged). */}
                    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                      {isUnread && !isChecked && (
                        <span
                          aria-hidden
                          data-unread-dot
                          className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 transition-opacity duration-150 group-pointer-hover:opacity-0"
                        />
                      )}
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={isChecked ? 'Deselect email' : 'Select email'}
                        aria-pressed={isChecked}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (e.shiftKey) {
                            onClick(e, threadId);
                            return;
                          }
                          setSelectionAnchor(threadId);
                          setSelectedThreads((prev) =>
                            prev.includes(threadId)
                              ? prev.filter((id) => id !== threadId)
                              : [...prev, threadId]
                          );
                        }}
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full transition-opacity duration-150',
                          isChecked
                            ? 'opacity-100'
                            : cn(
                                'focus-visible:!opacity-100 pointer-hover:!opacity-100 group-pointer-hover:!opacity-100',
                                isUnread ? 'opacity-0' : 'opacity-20'
                              )
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,color,transform] duration-150',
                            isChecked
                              ? 'border-selection bg-selection text-selection-foreground shadow-none'
                              : 'border-muted-foreground/20 text-muted-foreground/45 pointer-hover:scale-105 pointer-hover:border-muted-foreground/70 pointer-hover:bg-muted/70 pointer-hover:text-foreground group-pointer-hover:scale-105 group-pointer-hover:border-muted-foreground/70 group-pointer-hover:bg-muted/70 group-pointer-hover:text-foreground'
                          )}
                        >
                          <MonoIcon
                            type="Check"
                            className={cn(
                              'stroke-[1.5]',
                              isChecked ? 'h-3.5 w-3.5' : 'h-3 w-3',
                              isChecked
                                ? 'opacity-100'
                                : 'opacity-80 group-pointer-hover:text-foreground'
                            )}
                          />
                        </div>
                      </button>
                    </div>

                    {/* Avatar */}
                    <RecipientAvatar
                      className="h-6 w-6 shrink-0"
                      recipient={senderAvatarRecipient}
                      accountId={currentThread.accountId}
                      preferredImageSrc={senderAccountImageSrc}
                    />

                    {/* Sender column — fixed per breakpoint so subjects share one start x */}
                    <div className="flex w-32 shrink-0 items-center gap-2 overflow-hidden lg:w-40 xl:w-48">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <span
                          className={cn(
                            'block truncate text-[13px] tracking-tight',
                            isUnread
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-muted-foreground'
                          )}
                        >
                          <ThreadSenderNames thread={currentThread} accounts={accounts} />
                        </span>
                      </div>
                      {currentThread.items.length > 1 && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">
                          {currentThread.items.length}
                        </span>
                      )}
                    </div>

                    {/* Subject + snippet flow */}
                    <div className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden">
                      <span
                        className={cn(
                          'shrink-0 truncate text-[13px] tracking-tight',
                          highlightedContent.snippet ? 'max-w-[60%]' : 'max-w-full',
                          isUnread
                            ? 'font-medium text-foreground'
                            : 'font-normal text-foreground/80'
                        )}
                        dangerouslySetInnerHTML={{
                          __html:
                            !highlightedContent.subject || highlightedContent.subject === ''
                              ? '(No subject)'
                              : highlightedContent.subject
                        }}
                      />
                      {highlightedContent.snippet && (
                        <>
                          <span
                            aria-hidden
                            className="hidden shrink-0 text-muted-foreground/40 sm:inline"
                          >
                            –
                          </span>
                          <span
                            className="hidden min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground sm:inline"
                            dangerouslySetInnerHTML={{ __html: highlightedContent.snippet }}
                          />
                        </>
                      )}
                    </div>

                    <ThreadRowMeta
                      thread={currentThread}
                      accountLabels={accountLabels}
                      onLabelClick={(name) => memoizedSearchQuery(buildLabelQuery(name))}
                    />
                  </div>

                  {/* Attachment chips — tucked under the subject column. One line,
                      sized like the row's metadata, so they read as a detail of
                      the email rather than a card stacked under it. */}
                  {Object.keys(currentThread.attachments).length > 0 && (
                    // Starts under the subject: px-3 + 28px checkbox slot + avatar +
                    // sender column, with the row's 12px gaps (sender widens at lg/xl).
                    <div className="-mt-0.5 flex items-center gap-1.5 overflow-hidden pb-1.5 pl-[14.25rem] pr-6 lg:pl-[16.25rem] xl:pl-[18.25rem]">
                      {Object.keys(currentThread.attachments)
                        .slice(0, 2)
                        .map((id) => (
                          <AttachmentItem
                            variant="chip"
                            accountId={currentThread.accountId}
                            source={'message'}
                            itemId={currentThread.id}
                            key={currentThread.attachments[id].attachmentId}
                            preview
                            tabIndex={-1}
                            attachment={currentThread.attachments[id]}
                          />
                        ))}
                      {Object.keys(currentThread.attachments).length > 2 && (
                        <span className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                          +{Object.keys(currentThread.attachments).length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ThreadItemContextMenu>
          )}
        </div>
      );
    }
  )
);

ThreadListDenseItem.displayName = 'ThreadListDenseItem';
