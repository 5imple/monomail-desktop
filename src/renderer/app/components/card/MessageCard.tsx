import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import unsubscribeApi from '@/main/api/unsubscribe/unsubscribeApi';
import electronApi from '@/renderer/app/lib/electronApi';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { IMonoMessage, MonoMessage } from '@/main/models/message/MonoMessage';
import { parsePayloadPartWithHighlight } from '@/main/models/message/parsePayloadPartWithHighlight';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { generateUUID } from '@/main/utils';
import { CalendarEventCard } from '@/renderer/app/components/card/CalendarEventCard';
import DraftCard from '@/renderer/app/components/card/DraftCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/renderer/app/components/ui/card';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { CopyButton } from '@/renderer/app/components/ui/copy-button';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { formatDate, formatListDate, formatRelativeTime } from '@/renderer/app/lib/formatDate';
import { isCalendarAttachment } from '@/renderer/app/lib/icsParser';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useExtensionAtom } from '@/renderer/app/store/extension/useExtensionAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpring, useTransition } from '@react-spring/web';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Collapsible } from '@radix-ui/react-collapsible';
import { CollapsibleContent, CollapsibleTrigger } from '@/renderer/app/components/ui/collapsible';

interface MessageCardProps {
  className?: string;
  collapsed?: boolean;
  item: MonoMessage;
  draft?: MonoDraft;
  preview?: boolean;
  isLastCard?: boolean;
  contactToggle?: boolean;
  accountId?: string;
  cardClassName?: string;
  isFocused?: boolean;
  onFocusRequest?: () => void;
  handleContactOpen?: (recipient: MonoRecipient) => void;
  style?: React.CSSProperties;
}

const ALLOWED_INLINE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const shouldTransformEmailForDarkMode = false;
const failedRemoteImageUrls = new Set<string>();

function normalizeContentId(value?: string | null): string {
  if (!value) return '';

  let normalized = value.trim().replace(/^cid:/i, '').replace(/^<|>$/g, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Some senders use literal percent characters in Content-ID values.
  }

  return normalized.trim().replace(/^<|>$/g, '');
}

function findInlineImage(
  inlineImages: Record<string, MonoAttachment>,
  contentId?: string | null,
  attachmentId?: string | null
): MonoAttachment | null {
  if (attachmentId) {
    const attachment = Object.values(inlineImages).find(
      (inlineImage) => inlineImage.attachmentId === attachmentId
    );
    if (attachment) return attachment;
  }

  const normalizedContentId = normalizeContentId(contentId);
  if (!normalizedContentId) return null;

  return (
    inlineImages[normalizedContentId] ??
    Object.entries(inlineImages).find(
      ([key]) => normalizeContentId(key) === normalizedContentId
    )?.[1] ??
    null
  );
}

function toCssLength(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return /^\d+$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

const MessageCard = React.forwardRef<HTMLDivElement, MessageCardProps>(
  (
    {
      item,
      className,
      collapsed,
      preview,
      cardClassName,
      isLastCard,
      isFocused,
      handleContactOpen,
      onFocusRequest,
      accountId,
      draft,
      contactToggle,
      style
    },
    forwardedRef
  ) => {
    const { t } = useTranslation();
    const { currentTheme } = useTheme(); // Get dark mode state from theme store
    const { openContactsPanel } = useExtensionAtom();
    const { globalSearchQuery } = useGlobalAtom();
    const { accounts } = useAuth();

    const [replyActive, setReplyActive] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(collapsed);
    const [showQuotedContent, setShowQuotedContent] = useState(false);
    const [showCcDropdown, setShowCcDropdown] = useState(false);
    const [showBccDropdown, setShowBccDropdown] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRef = useRef<HTMLDivElement | null>(null);
    const messageContentRef = useRef<HTMLDivElement>(null);
    const quotedContentRef = useRef<HTMLDivElement>(null);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [isUnsubscribed, setIsUnsubscribed] = useState(false);
    const [unsubscribedLoading, setUnsubscribedLoading] = useState(true);

    const executeCommand = useExecuteCommand();
    const [currentMessage, setCurrentMessage] = useState<IMonoMessage>(item.toPlainObject());
    const [showTrackingDropdown, setShowTrackingDropdown] = useState(false);
    const { getMessageTrackingHistory, fetchAndSetTrackingHistories } = useTrackingAtom();
    const isDarkMode = useMemo(
      () => currentTheme === 'dark' || currentTheme === 'black',
      [currentTheme]
    );
    const trackingHistory = useMemo(() => {
      return accountId ? getMessageTrackingHistory(accountId, currentMessage.id) : [];
    }, [accountId, currentMessage.id, getMessageTrackingHistory]);
    const trackingTimes = useMemo(() => {
      if (!trackingHistory || trackingHistory.length === 0) return null;

      const readTimes = trackingHistory
        .map((h) => new Date(h.readAt + 'Z').getTime())
        .sort((a, b) => a - b);
      const firstRead = readTimes[0];
      const lastRead = readTimes[readTimes.length - 1];

      return {
        firstRead: formatRelativeTime(firstRead),
        lastRead: formatRelativeTime(lastRead)
      };
    }, [trackingHistory]);
    const { registerItem, unregisterItem } = useKeyboardNavigationContext();
    const [copySuccess, setCopySuccess] = useState(false);
    const [showTrackerPrevention, setShowTrackerPrevention] = useState(false);
    const [trackingLoading, setTrackingLoading] = useState(false);

    const shouldParsePayload = isLastCard || !isCollapsed;

    const [parsedPayload, setParsedPayload] = useState<{
      content: string;
      history: string[];
      trackingImagesRemoved?: number;
      trackingDomains?: string[];
    } | null>(
      shouldParsePayload
        ? parsePayloadPartWithHighlight(item, globalSearchQuery, shouldTransformEmailForDarkMode)
        : null
    );

    const handleOpenContactPanel = (recipient: MonoRecipient) => {
      // openContactsPanel(recipient);
      handleContactOpen?.(recipient);
    };

    const handleClickNewEmail = (recipient: MonoRecipient) => {
      // Use the current user's account email as 'from', not the message sender's email
      const userEmail = accounts.length > 0 ? accounts[0].email : '';
      executeCommand('COMPOSE_NEW_MESSAGE', {
        draft: new MonoDraft({ from: userEmail, to: [recipient.email] })
      });
    };

    // Lazy parsing function with email-document rendering.
    const parseIfNeeded = () => {
      if (!parsedPayload) {
        const processedContent = parsePayloadPartWithHighlight(
          item,
          globalSearchQuery,
          shouldTransformEmailForDarkMode
        );

        setParsedPayload(processedContent);
      }
    };

    useEffect(() => {
      if (itemRef.current) {
        registerItem('message-list', item.id, itemRef.current);
      }

      return () => {
        unregisterItem('message-list', item.id);
      };
    }, []);

    // Keep the rendered message in sync when metadata-only list data is
    // replaced by the full Gmail payload. The parser cache key also includes
    // payload shape, so this reprocesses the HTML instead of reusing an empty
    // metadata parse.
    useEffect(() => {
      setCurrentMessage(item.toPlainObject());

      setParsedPayload((currentParsedPayload) => {
        if (!currentParsedPayload && !shouldParsePayload) return null;
        return parsePayloadPartWithHighlight(
          item,
          globalSearchQuery,
          shouldTransformEmailForDarkMode
        );
      });
    }, [globalSearchQuery, item, shouldParsePayload]);

    // Trigger parsing when expanded or scrolled into view
    useEffect(() => {
      if (!isCollapsed) {
        parseIfNeeded();
      }
      // const timeout = setTimeout(() => setIsVisible(true), 150);
    }, [isCollapsed]);

    useEffect(() => {
      if (!parsedPayload || !accountId) return;

      const roots = [
        messageContentRef.current,
        showQuotedContent ? quotedContentRef.current : null
      ].filter(Boolean) as HTMLDivElement[];
      if (roots.length === 0) return;

      const abortController = new AbortController();

      const markImageUnavailable = (img: HTMLImageElement, skeleton?: HTMLElement) => {
        skeleton?.remove();
        img.dataset.monoInlineState = 'error';
        img.style.display = 'none';

        const fallback = document.createElement('div');
        fallback.className =
          'my-2 inline-flex min-h-[72px] max-w-full items-center rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground';
        fallback.textContent = 'Image unavailable';
        img.parentNode?.insertBefore(fallback, img.nextSibling);
        requestAnimationFrame(updateHeight);
      };

      const loadInlineImage = async (img: HTMLImageElement) => {
        if (
          img.dataset.monoInlineState === 'loaded' ||
          img.dataset.monoInlineState === 'loading' ||
          img.dataset.monoInlineState === 'error'
        ) {
          return;
        }

        const attachmentId = img.getAttribute('data-attachment-id');
        const contentId = normalizeContentId(
          img.getAttribute('data-content-id') || img.getAttribute('src')
        );
        const inlineImage = findInlineImage(item.inlineImages, contentId, attachmentId);

        if (!inlineImage) return;

        if (!ALLOWED_INLINE_IMAGE_MIMES.has(inlineImage.mimeType)) {
          img.remove();
          requestAnimationFrame(updateHeight);
          return;
        }

        img.dataset.monoInlineState = 'loading';
        img.setAttribute('data-attachment-id', inlineImage.attachmentId);
        if (contentId) img.setAttribute('data-content-id', contentId);

        const skeleton = document.createElement('div');
        skeleton.className = 'my-2 animate-pulse rounded-md bg-muted-low';
        skeleton.style.width = toCssLength(img.getAttribute('width') || img.style.width, '100%');
        skeleton.style.height = toCssLength(
          img.getAttribute('height') || img.style.height,
          '120px'
        );

        img.style.display = 'none';
        img.parentNode?.insertBefore(skeleton, img);
        requestAnimationFrame(updateHeight);

        try {
          const inlineAttachment = await mailApi.getAttachmentInline(
            accountId,
            item.id,
            inlineImage.attachmentId,
            abortController.signal
          );
          if (abortController.signal.aborted) return;

          img.onload = () => {
            skeleton.remove();
            img.dataset.monoInlineState = 'loaded';
            img.style.display = '';
            img.style.maxWidth = '100%';
            if (isDarkMode) {
              img.style.border = '1px solid rgba(24, 24, 27, 0.08)';
            }
            updateHeight();
          };
          img.onerror = () => markImageUnavailable(img, skeleton);
          img.src = `data:${inlineImage.mimeType};base64,${inlineAttachment.data}`;
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error('Failed to load inline image', error);
            markImageUnavailable(img, skeleton);
          }
        }
      };

      const images = roots.flatMap((root) =>
        Array.from(
          root.querySelectorAll<HTMLImageElement>('img[data-attachment-id], img[src^="cid:"]')
        )
      );

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target as HTMLImageElement;
            observer.unobserve(img);
            void loadInlineImage(img);
          });
        },
        { rootMargin: '200px 0px' }
      );

      images.forEach((img) => {
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        observer.observe(img);
      });

      return () => {
        abortController.abort();
        observer.disconnect();
      };
    }, [
      accountId,
      item.id,
      item.inlineImages,
      parsedPayload?.content,
      showQuotedContent,
      isDarkMode
    ]);

    const updateHeight = () => {
      if (containerRef.current && contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight;

        // Check if messageContent is scaled and adjust height accordingly
        if (messageContentRef.current?.classList.contains('scaled')) {
          const messageElement = messageContentRef.current;
          const originalMessageHeight = messageElement.scrollHeight;
          const scaleFactor =
            parseFloat(messageElement.style.getPropertyValue('--scale-factor')) || 1;
          const scaledMessageHeight = originalMessageHeight * scaleFactor;
          const heightDifference = originalMessageHeight - scaledMessageHeight;
          contentHeight = contentHeight - heightDifference;
        }

        // Check if quotedContent is scaled and adjust height accordingly
        if (quotedContentRef.current?.classList.contains('scaled') && showQuotedContent) {
          const quotedElement = quotedContentRef.current;
          const originalQuotedHeight = quotedElement.scrollHeight;
          const scaleFactor =
            parseFloat(quotedElement.style.getPropertyValue('--scale-factor')) || 1;
          const scaledQuotedHeight = originalQuotedHeight * scaleFactor;
          const heightDifference = originalQuotedHeight - scaledQuotedHeight;
          contentHeight = contentHeight - heightDifference;
        }

        containerRef.current.style.height = isCollapsed ? '0px' : `${contentHeight}px`;
      }
    };

    useEffect(() => {
      const timeout = setTimeout(() => {
        updateHeight();
      }, 250);

      const handleResize = () => {
        updateHeight();
      };

      // Create ResizeObserver to detect panel resize
      const resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });

      // Find and observe the panel container for resize events
      const panelContainer = containerRef.current?.closest('[data-nav-area="display-panel"]');
      if (panelContainer) {
        resizeObserver.observe(panelContainer);
      }

      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(timeout);
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
      };
    }, [
      showQuotedContent,
      contentRef.current,
      parsedPayload,
      aiSuggestions,
      showQuotedContent,
      showBccDropdown,
      showCcDropdown,
      showTrackingDropdown,
      showTrackerPrevention,
      draft,
      contactToggle
    ]);

    useEffect(() => {
      updateHeight();
    }, [isCollapsed]);

    // Auto-scale content that overflows
    const applyScaling = (element: HTMLDivElement) => {
      if (!element || !element.parentElement) return;

      const parent = element.parentElement;
      const parentWidth = parent.clientWidth - 14;
      const contentWidth = element.scrollWidth;

      if (contentWidth > parentWidth) {
        const scaleFactor = parentWidth / contentWidth;
        element.style.setProperty('--scale-factor', scaleFactor.toString());
        element.classList.add('scaled');

        // Recalculate height after scaling
        requestAnimationFrame(() => {
          updateHeight();
        });
      } else {
        element.style.removeProperty('--scale-factor');
        element.classList.remove('scaled');

        // Recalculate height when scaling is removed
        requestAnimationFrame(() => {
          updateHeight();
        });
      }
    };

    useEffect(() => {
      const handleScaling = () => {
        if (messageContentRef.current) {
          applyScaling(messageContentRef.current);
        }
        if (quotedContentRef.current && showQuotedContent) {
          applyScaling(quotedContentRef.current);
        }
      };

      // Apply scaling after content loads and on resize
      const timeout = setTimeout(handleScaling, 100);

      const resizeObserver = new ResizeObserver(handleScaling);
      const panelContainer = containerRef.current?.closest('[data-nav-area="display-panel"]');
      if (panelContainer) {
        resizeObserver.observe(panelContainer);
      }

      window.addEventListener('resize', handleScaling);

      return () => {
        clearTimeout(timeout);
        window.removeEventListener('resize', handleScaling);
        resizeObserver.disconnect();
      };
    }, [parsedPayload, showQuotedContent, isCollapsed]);

    useEffect(() => {
      const roots = [
        messageContentRef.current,
        showQuotedContent ? quotedContentRef.current : null
      ].filter(Boolean) as HTMLDivElement[];
      if (roots.length === 0) return () => {};

      const images = roots.flatMap((root) => Array.from(root.querySelectorAll('img')));

      const onImageLoad = () => {
        requestAnimationFrame(updateHeight);
      };

      images.forEach((img) => {
        if (img.complete) {
          onImageLoad();
        } else {
          img.addEventListener('load', onImageLoad);
          img.addEventListener('error', onImageLoad);
        }
      });

      return () => {
        images.forEach((img) => {
          img.removeEventListener('load', onImageLoad);
          img.removeEventListener('error', onImageLoad);
        });
      };
    }, [parsedPayload?.content, showQuotedContent]);

    useEffect(() => {
      const roots = [
        messageContentRef.current,
        showQuotedContent ? quotedContentRef.current : null
      ].filter(Boolean) as HTMLDivElement[];
      if (roots.length === 0) return () => {};

      const markRemoteImageUnavailable = (img: HTMLImageElement, src: string) => {
        if (img.dataset.monoRemoteImageState === 'error') return;

        failedRemoteImageUrls.add(src);
        img.dataset.monoRemoteImageState = 'error';
        img.removeAttribute('src');
        img.style.display = 'none';

        const fallback = document.createElement('div');
        fallback.className =
          'my-2 inline-flex min-h-[72px] max-w-full items-center rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground';
        fallback.textContent = 'Image unavailable';
        img.parentNode?.insertBefore(fallback, img.nextSibling);
        requestAnimationFrame(updateHeight);
      };

      const images = roots.flatMap((root) =>
        Array.from(
          root.querySelectorAll<HTMLImageElement>(
            'img[src^="http://"], img[src^="https://"], img[src^="//"]'
          )
        )
      );

      const cleanups = images.map((img) => {
        const src = img.getAttribute('src');
        if (!src) return () => {};

        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';

        if (failedRemoteImageUrls.has(src)) {
          markRemoteImageUnavailable(img, src);
          return () => {};
        }

        const handleError = () => markRemoteImageUnavailable(img, src);
        img.addEventListener('error', handleError, { once: true });
        return () => img.removeEventListener('error', handleError);
      });

      return () => {
        cleanups.forEach((cleanup) => cleanup());
      };
    }, [parsedPayload?.content, showQuotedContent]);

    const transitions = useTransition(aiSuggestions, {
      from: { opacity: 0, transform: 'translateY(20px)' },
      enter: { opacity: 1, transform: 'translateY(0px)' },
      leave: { opacity: 0, transform: 'translateY(-20px)' },
      config: { tension: 200, friction: 20 }
    });

    const springStyle = useSpring({
      height: isCollapsed ? 0 : 'auto',
      opacity: isCollapsed ? 0 : 1,
      config: { tension: 220, friction: 20 }
    });

    /**
     * Expand on hover only if the message was collapsed.
     */
    const handleMouseEnter = () => {
      if (!isCollapsed) return; // Do nothing if already expanded.
      parseIfNeeded();
    };

    /**
     * Collapse on mouse leave only if it was auto-expanded by hover.
     */
    const handleMouseLeave = () => {};

    // Add this function to your MessageCard component
    const handleUnsubscribe = async (e: React.MouseEvent) => {
      e.stopPropagation();

      const uuid = generateUUID();

      const unsubscribePromise = async (): Promise<{ mode: 'https' | 'mailto' }> => {
        if (!accountId) throw new Error('No account found');
        if (!currentMessage.listUnsubscribe || !currentMessage.listUnsubscribe.url.length) {
          throw new Error('No unsubscribe URL available.');
        }

        const unsubscribeUrls = currentMessage.listUnsubscribe.url;
        const httpsUrl = unsubscribeUrls.find((rawUrl) => {
          try {
            return new URL(rawUrl).protocol === 'https:';
          } catch {
            return false;
          }
        });
        const mailtoUrl = unsubscribeUrls.find((rawUrl) => /^mailto:/i.test(rawUrl));

        if (httpsUrl) {
          const response = await electronApi.unsubscribeFetch(httpsUrl);
          if (!response.ok) {
            console.error('Unsubscribe failed:', response.error ?? response.status);
            if (!mailtoUrl) {
              throw new Error(`Failed to unsubscribe: ${response.error ?? response.status}`);
            }
          } else {
            apiClient.setApiActiveUid(accountId);
            await unsubscribeApi.addUnsubscribedEmail({ email: currentMessage.from.email });
            setIsUnsubscribed(true);
            return { mode: 'https' };
          }
        }

        if (mailtoUrl) {
          window.open(mailtoUrl, '_blank', 'noopener,noreferrer');
          return { mode: 'mailto' };
        }

        throw new Error('No supported unsubscribe URL found.');
      };

      toast.promise(unsubscribePromise, {
        id: uuid,
        loading: 'Unsubscribing from mailing list',
        success: (result) =>
          result.mode === 'mailto' ? 'Opened unsubscribe email' : 'Successfully unsubscribed',
        error: (err) => `Failed to unsubscribe: ${err.message}`
      });
    };

    useEffect(() => {
      const fetchUnsubscribeInfo = async () => {
        if (accountId && currentMessage.labelIds.includes('CATEGORY_PROMOTIONS') && !isCollapsed) {
          try {
            setUnsubscribedLoading(true);
            apiClient.setApiActiveUid(accountId);
            const unsubscribedCheck = await unsubscribeApi.checkUnsubscribedEmail({
              email: currentMessage.from.email
            });
            setIsUnsubscribed(unsubscribedCheck);
            if (!unsubscribedCheck) {
              const unsubscribeInfo = await mailApi.getMessageUnsubscribe(
                accountId,
                currentMessage.id
              );

              if (unsubscribeInfo && unsubscribeInfo.listUnsubscribe && !unsubscribedCheck) {
                setCurrentMessage((prev) => ({
                  ...prev,
                  listUnsubscribe: unsubscribeInfo.listUnsubscribe
                }));
              }
            }

            setTimeout(() => {
              setUnsubscribedLoading(false);
            }, 0);
          } catch (error) {
            console.error('Failed to get unsubscribe info:', error);
          }
        }
      };

      fetchUnsubscribeInfo();
    }, [currentMessage.id]);

    return (
      <div
        ref={forwardedRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn('group relative', className)}
      >
        <Card
          ref={itemRef}
          className={cn(
            // Newton reader card: minimal shadow + crisp border. The
            // previous `shadow-lg` made every message a chunky elevated
            // block — Newton's reader feels like a quiet document with
            // soft section dividers instead.
            'duration-50 overflow-hidden border-border/60 shadow-sm transition-all',
            ringVariants,
            draft && 'mb-2',
            cardClassName
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setIsCollapsed(!isCollapsed);
          }}
          style={style}
        >
          <CardHeader
            className={cn('p-4 sm:p-5')}
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
              onFocusRequest?.();
            }}
          >
            {/* Newton sender row: avatar + sender name (tracking-tight,
                medium weight) + sender email (muted, hidden when
                collapsed to leave space for snippet). Timestamp on the
                right in mono tabular-nums. */}
            <div className="flex items-center gap-3 text-sm">
              <RecipientAvatar recipient={currentMessage.from} />
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between gap-2 overflow-hidden text-ellipsis">
                  <div className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="text-[14px] font-medium tracking-tight text-foreground">
                      {currentMessage.from && currentMessage.from.name.length > 0
                        ? currentMessage.from.name[0].toUpperCase() +
                          currentMessage.from.name.slice(1)
                        : currentMessage.from.email.split('@')[0]}
                    </span>
                    {!isCollapsed && currentMessage.from?.name?.length > 0 && (
                      <span className="hidden text-[12px] text-muted-foreground sm:inline">
                        {currentMessage.from.email}
                      </span>
                    )}
                  </div>
                  {/* {currentMessage.id} / {currentMessage.threadId} */}
                  {!isCollapsed &&
                    currentMessage.listUnsubscribe.url.length > 0 &&
                    !isUnsubscribed && (
                      <Button
                        onClick={handleUnsubscribe}
                        variant={'default'}
                        sizeVariant={'xs'}
                        className={cn(
                          'no-drag transition-all duration-300',
                          unsubscribedLoading ? 'pointer-events-none opacity-0' : 'opacity-100'
                        )}
                      >
                        Unsubscribe
                      </Button>
                    )}
                  {!isCollapsed &&
                    currentMessage.listUnsubscribe.url.length > 0 &&
                    isUnsubscribed && (
                      <div
                        className={cn(
                          'flex items-center gap-1 overflow-hidden text-ellipsis rounded-md border p-1 px-2 text-xs transition-all duration-300',
                          unsubscribedLoading ? 'pointer-events-none opacity-0' : 'opacity-100'
                        )}
                      >
                        <MonoIcon type={'AlertCircle'} />
                        <div className="flex-1 overflow-hidden text-ellipsis">
                          <span className="whitespace-nowrap">
                            {' '}
                            You unsubscribed from {currentMessage.from.email}
                          </span>
                        </div>
                      </div>
                    )}
                  <div
                    className={cn(
                      'flex-1 overflow-hidden text-ellipsis text-muted-foreground opacity-0 transition-opacity',
                      isCollapsed && 'opacity-100'
                    )}
                  >
                    <span className="whitespace-nowrap">{currentMessage.snippet}</span>
                  </div>
                  {currentMessage.timestamp && (
                    <div className="ml-auto flex items-center gap-2 text-muted-foreground">
                      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums">
                        {formatDate(currentMessage.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Use currentMessage instead of item in the content */}
          <div
            ref={containerRef}
            className="transition-height overflow-hidden duration-300 ease-bouncy-in-out"
          >
            <div ref={contentRef}>
              <div className={cn('ml-12 grid gap-1 px-4 pb-4 pt-0', isCollapsed ? '' : '')}>
                <div className="inline-flex items-start gap-1 text-xs">
                  <span className="mt-0.5 font-medium text-muted-foreground">
                    {t('message_card.to')}:
                  </span>{' '}
                  <div className="flex flex-col">
                    {currentMessage.to.length === 0 ? (
                      <span>({t('message_card.no_recipient')})</span>
                    ) : (
                      currentMessage.to.map((recipient) => {
                        return (
                          <span key={recipient.email} className="mr-1">
                            {preview ? (
                              <span className="text-xs">{`${recipient.name} (${recipient.email})`}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="group/email flex items-center gap-1">
                                  <Button
                                    onClick={() => handleOpenContactPanel(recipient)}
                                    className="text-xs"
                                    variant="link"
                                    typeVariant={'inline'}
                                  >
                                    {`${recipient.name} (${recipient.email})`}
                                  </Button>

                                  <div className="flex items-center opacity-0 transition-opacity group-hover/email:opacity-100">
                                    <CopyButton sizeVariant="xxs" textToCopy={recipient.email} />

                                    <Button
                                      typeVariant={'icon'}
                                      variant={'ghost'}
                                      sizeVariant={'xxs'}
                                      onClick={() => {
                                        handleClickNewEmail(recipient);
                                      }}
                                    >
                                      <MonoIcon
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        type={'Edit'}
                                      />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {t('message_card.reply_to')}:
                  </span>{' '}
                  {preview ? (
                    <span className="text-xs">{`${currentMessage.from.name} (${currentMessage.from.email})`}</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="group/email flex items-center gap-1">
                        <Button
                          onClick={() => handleOpenContactPanel(currentMessage.from)}
                          className="select-text text-xs"
                          variant="link"
                          typeVariant={'inline'}
                        >
                          {currentMessage.from &&
                            `${currentMessage.from.name} (${currentMessage.from.email})`}
                        </Button>
                        <div className="flex items-center opacity-0 transition-opacity group-hover/email:opacity-100">
                          <CopyButton sizeVariant="xxs" textToCopy={currentMessage.from.email} />
                          <Button
                            typeVariant={'icon'}
                            variant={'ghost'}
                            sizeVariant={'xxs'}
                            onClick={() => {
                              handleClickNewEmail(currentMessage.from);
                            }}
                          >
                            <MonoIcon className="h-3.5 w-3.5 text-muted-foreground" type={'Edit'} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* CC Recipients - Only show if there are cc recipients */}
                {currentMessage.cc && currentMessage.cc.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t('message_card.cc')}:
                    </span>
                    <Button
                      className="ml-1 h-auto select-text p-0 text-xs"
                      variant="link"
                      typeVariant={'inline'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCcDropdown(!showCcDropdown);
                      }}
                    >
                      {currentMessage.cc.length} {t('message_card.recipients')}
                      <MonoIcon
                        type={showCcDropdown ? 'ChevronUp' : 'ChevronDown'}
                        className="ml-1 h-3 w-3"
                      />
                    </Button>
                    {showCcDropdown && (
                      <div className="ml-7 mt-1">
                        {currentMessage.cc.map((recipient) => (
                          <div key={recipient.email} className="py-1 text-xs">
                            {preview ? (
                              <span>{`${recipient.name} (${recipient.email})`}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="group/email flex items-center gap-1">
                                  <Button
                                    onClick={() => handleOpenContactPanel(recipient)}
                                    className="select-text text-xs"
                                    variant="link"
                                    typeVariant={'inline'}
                                  >
                                    {`${recipient.name} (${recipient.email})`}
                                  </Button>

                                  <div className="flex items-center opacity-0 transition-opacity group-hover/email:opacity-100">
                                    <CopyButton sizeVariant="xxs" textToCopy={recipient.email} />

                                    <Button
                                      typeVariant={'icon'}
                                      variant={'ghost'}
                                      sizeVariant={'xxs'}
                                      onClick={() => {
                                        handleClickNewEmail(recipient);
                                      }}
                                    >
                                      <MonoIcon
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        type={'Edit'}
                                      />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* BCC Recipients - Only show if there are bcc recipients */}
                {currentMessage.bcc && currentMessage.bcc.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium text-muted-foreground">
                      {t('message_card.bcc')}:
                    </span>
                    <Button
                      className="ml-1 h-auto select-text p-0 text-xs"
                      variant="link"
                      typeVariant={'inline'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowBccDropdown(!showBccDropdown);
                      }}
                    >
                      {currentMessage.bcc.length} {t('message_card.recipients')}
                      <MonoIcon
                        type={showBccDropdown ? 'ChevronUp' : 'ChevronDown'}
                        className="ml-1 h-3 w-3"
                      />
                    </Button>
                    {showBccDropdown && (
                      <div className="ml-7 mt-1">
                        {currentMessage.bcc.map((recipient) => (
                          <div key={recipient.email} className="py-1 text-xs">
                            {preview ? (
                              <span>{`${recipient.name} (${recipient.email})`}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="group/email flex items-center gap-1">
                                  <Button
                                    onClick={() => handleOpenContactPanel(recipient)}
                                    className="select-text text-xs"
                                    variant="link"
                                    typeVariant={'inline'}
                                  >
                                    {`${recipient.name} (${recipient.email})`}
                                  </Button>

                                  <div className="flex items-center opacity-0 transition-opacity group-hover/email:opacity-100">
                                    <CopyButton sizeVariant="xxs" textToCopy={recipient.email} />

                                    <Button
                                      typeVariant={'icon'}
                                      variant={'ghost'}
                                      sizeVariant={'xxs'}
                                      onClick={() => {
                                        handleClickNewEmail(recipient);
                                      }}
                                    >
                                      <MonoIcon
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        type={'Edit'}
                                      />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tracking History - Show tracking icon based on tracking state */}
                {trackingHistory && (
                  <div className="mt-1">
                    <div className="text-xs">
                      {trackingHistory.length === 0 ? (
                        // Tracking enabled but not seen yet - show muted-foreground check
                        <div className="flex items-center gap-2">
                          <MonoIcon type={'Check'} className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Not read</span>
                          <Button
                            typeVariant={'icon'}
                            variant={'ghost'}
                            sizeVariant={'xxs'}
                            className="mt-0.5"
                            disabled={trackingLoading}
                            onClick={() => {
                              setTrackingLoading(true);
                              fetchAndSetTrackingHistories();
                              setTimeout(() => {
                                setTrackingLoading(false);
                              }, 150);
                            }}
                          >
                            <MonoIcon
                              type={'RotateCcw'}
                              className={cn(
                                'h-3 w-3 text-muted-foreground transition-transform duration-300',
                                trackingLoading && '-rotate-180'
                              )}
                            />
                          </Button>
                        </div>
                      ) : (
                        // Seen more than once - show text-accent with read count
                        <div className="flex items-center gap-2">
                          <Button
                            className="ml-1 h-auto select-text p-0 text-xs"
                            variant="link"
                            typeVariant={'inline'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowTrackingDropdown(!showTrackingDropdown);
                            }}
                          >
                            <MonoIcon
                              type={trackingHistory.length > 1 ? 'CheckCheck' : 'Check'}
                              className="mr-1 h-3 w-3 text-accent"
                            />
                            {trackingHistory.length} Read{trackingHistory.length > 1 ? 's' : ''}
                            <MonoIcon
                              type={showTrackingDropdown ? 'ChevronUp' : 'ChevronDown'}
                              className="ml-1 h-3 w-3"
                            />
                          </Button>
                          {trackingTimes && (
                            <div className="font-medium text-muted-foreground">
                              {trackingTimes.lastRead && (
                                <div>Last read {trackingTimes.lastRead}</div>
                              )}
                            </div>
                          )}
                          <Button
                            typeVariant={'icon'}
                            variant={'ghost'}
                            sizeVariant={'xxs'}
                            className="mt-0.5"
                            disabled={trackingLoading}
                            onClick={() => {
                              setTrackingLoading(true);
                              fetchAndSetTrackingHistories();
                              setTimeout(() => {
                                setTrackingLoading(false);
                              }, 150);
                            }}
                          >
                            <MonoIcon
                              type={'RotateCcw'}
                              className={cn(
                                'h-3 w-3 text-muted-foreground transition-transform duration-300',
                                trackingLoading && '-rotate-180'
                              )}
                            />
                          </Button>
                        </div>
                      )}
                      {showTrackingDropdown && trackingHistory.length > 0 && (
                        <div className="mt-1">
                          <ScrollArea
                            viewportClassName="max-h-[48px]"
                            style={{
                              maskImage:
                                'linear-gradient(0deg, transparent 0%, hsl(var(--card)) 10%, hsl(var(--card)) 90%, transparent 100%)'
                            }}
                          >
                            {[...trackingHistory].map((history) => (
                              <div key={history.tid} className="text-xs">
                                <div className="line-clamp-1 flex gap-1">
                                  <div className="flex items-center gap-2">
                                    <MonoIcon
                                      type={'Eye'}
                                      className="ml-1 h-3 w-3 text-muted-foreground"
                                    />
                                    <span className="line-clamp-1 font-medium">Read</span>
                                  </div>
                                  <div className="line-clamp-1 text-muted-foreground">
                                    {formatListDate(
                                      new Date(history.readAt + 'Z').getTime(),
                                      Intl.DateTimeFormat().resolvedOptions().timeZone
                                    )}
                                  </div>
                                  {/* {history.userAgent && (
                                  <div className="truncate text-muted-foreground">
                                    {history.userAgent}
                                  </div>
                                )} */}
                                </div>
                              </div>
                            ))}
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <CardContent className="p-0">
                {!preview &&
                  Object.values(currentMessage.attachments).length > 0 &&
                  accountId &&
                  Object.values(currentMessage.attachments).some((att) =>
                    isCalendarAttachment(att)
                  ) && (
                    <div className="mx-3 my-2 flex-1">
                      {Object.values(currentMessage.attachments)
                        .filter(isCalendarAttachment)
                        .map((attachment) => (
                          <CalendarEventCard
                            key={`calendar-${attachment.attachmentId}`}
                            attachment={attachment}
                            accountId={accountId}
                            messageId={currentMessage.id}
                          />
                        ))}
                    </div>
                  )}
                {!isCollapsed && parsedPayload && parsedPayload.trackingImagesRemoved
                  ? parsedPayload?.trackingImagesRemoved > 0 && (
                      <div className="mx-4 mb-4 flex items-center gap-2 rounded-md bg-accent/5 p-3 text-sm text-foreground">
                        <Collapsible
                          className="w-full"
                          open={showTrackerPrevention}
                          onOpenChange={setShowTrackerPrevention}
                        >
                          <CollapsibleTrigger asChild>
                            <div className="flex w-full items-center gap-2">
                              <MonoIcon
                                type={'Shield'}
                                className="mb-0.5 h-4 w-4 shrink-0 text-accent"
                              />
                              <span className="line-clamp-1">
                                {t(
                                  parsedPayload.trackingImagesRemoved === 1
                                    ? 'message_card.privacy_protection_one'
                                    : 'message_card.privacy_protection_other',
                                  { count: parsedPayload.trackingImagesRemoved }
                                )}
                              </span>
                              <MonoIcon type={'ChevronDown'} className="ml-auto h-4 w-4" />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-2 pl-6 pt-2">
                              {parsedPayload.trackingDomains &&
                              parsedPayload.trackingDomains.length > 0 ? (
                                parsedPayload.trackingDomains.map((domain, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-2 text-sm text-foreground"
                                  >
                                    <span className="line-clamp-1">
                                      Tracker removed from{' '}
                                      <span className="font-medium">{domain}</span>
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <MonoIcon
                                    type={'Shield'}
                                    className="mb-0.5 h-4 w-4 shrink-0 text-accent"
                                  />
                                  <span>Trackers removed</span>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )
                  : null}
                <div className="overflow-hidden px-4 pb-4">
                  <div className="email-document overflow-x-auto rounded-md border border-black/5 bg-white px-4 py-3 text-[#202124]">
                    <div
                      ref={messageContentRef}
                      className={cn(
                        'mono-content-reset scale-to-fit',
                        'relative block origin-top-left cursor-auto select-text'
                      )}
                      dangerouslySetInnerHTML={{
                        __html:
                          parsedPayload?.content.replaceAll('\r\n', '\n').replaceAll('\r', '\n') ||
                          ''
                      }}
                    />
                  </div>
                </div>
                {!isCollapsed && parsedPayload && parsedPayload.history.length > 0 && (
                  <>
                    <div className="p-4 pt-0">
                      <Button
                        className="px-2"
                        variant="secondary"
                        tooltip={t('tooltip.show_quoted')}
                        typeVariant={'inline'}
                        onClick={() => setShowQuotedContent(!showQuotedContent)}
                      >
                        <MonoIcon type={'MoreHorizontal'} className="h-4 w-4" />
                      </Button>
                    </div>

                    <div
                      className={cn(
                        'overflow-hidden transition-opacity duration-150',
                        showQuotedContent ? 'p-6 pt-0 opacity-100' : 'h-0 opacity-0'
                      )}
                    >
                      <div className="email-document overflow-x-auto rounded-md border border-black/5 bg-white px-4 py-3 text-[#202124]">
                        <div
                          ref={quotedContentRef}
                          className={cn(
                            'mono-content-reset scale-to-fit relative block origin-top-left select-text'
                          )}
                          dangerouslySetInnerHTML={{
                            __html: (parsedPayload?.history || []).join('')
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </div>
          </div>

          {/* Attachments section - always visible even when collapsed */}
          {Object.values(currentMessage.attachments).length > 0 && (
            <CardFooter
              className={cn('flex flex-col items-start gap-3 p-4', isCollapsed ? 'pt-1' : '')}
            >
              {/* <div className="text-sm">
                <MonoIcon
                  type={'Paperclip'}
                  className="mr-2 inline-block h-4 w-4 text-muted-foreground"
                />
                <span>
                  {Object.values(currentMessage.attachments).length} attachment
                  {Object.values(currentMessage.attachments).length > 1 ? 's' : ''}
                </span>
              </div> */}

              <div className="flex flex-wrap gap-3 text-center">
                {accountId &&
                  Object.values(currentMessage.attachments).map((attachment) => (
                    <AttachmentItem
                      accountId={accountId}
                      source={'message'}
                      key={attachment.attachmentId}
                      itemId={currentMessage.id}
                      preview
                      attachment={attachment}
                    />
                  ))}
              </div>
            </CardFooter>
          )}
          {draft && (
            <DraftCard
              cardClassName={cn(
                'rounded-none border-0 border-t',
                isCollapsed ? 'h-0 max-h-0 border-t-0' : ''
              )}
              item={draft}
            />
            // <InlineComposeCard
            //   className={cn(
            //     'rounded-none border-0 border-t',
            //     isCollapsed ? 'h-0 max-h-0 border-t-0' : ''
            //   )}
            //   draft={draft}
            //   ref={ref}
            // />
          )}
        </Card>
        <div className="absolute -bottom-5 left-0 right-0 z-10 flex flex-col gap-2">
          {!replyActive && !preview && !item.labelIds.includes('DRAFT') && !draft && (
            <div
              className={cn(
                '-bottom-4 mx-auto flex justify-center opacity-0 duration-200',
                isLastCard ? 'opacity-100' : 'group-hover:opacity-100',

                isFocused && 'shadow-md'
              )}
            >
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setIsCollapsed(false);
                    onFocusRequest?.();
                    executeCommand('COMPOSE_REPLY_MESSAGE', {
                      message: item,
                      accountId: accountId
                    });
                  }}
                  variant={'ghost'}
                  sizeVariant={'sm'}
                  className="rounded-full"
                  style={{
                    height: '34px',
                    padding: '0 14px',
                    backgroundColor: 'rgba(255,255,255,0.035)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#aaa7a0'
                  }}
                  tooltipSide="bottom"
                  tooltip={t('message_card.reply')}
                  shortcut={isLastCard ? 'R' : undefined}
                >
                  <MonoIcon className="mr-2 shrink-0" type={'Reply'} />
                  {t('message_card.reply')}
                </Button>
                <Button
                  onClick={() => {
                    setIsCollapsed(false);
                    onFocusRequest?.();
                    executeCommand('COMPOSE_FORWARD_MESSAGE', {
                      message: item,
                      accountId: accountId
                    });
                  }}
                  variant={'ghost'}
                  sizeVariant={'sm'}
                  className="rounded-full"
                  style={{
                    height: '34px',
                    padding: '0 14px',
                    backgroundColor: 'rgba(255,255,255,0.035)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#aaa7a0'
                  }}
                  tooltipSide="bottom"
                  tooltip={t('message_card.forward')}
                  shortcut={isLastCard ? 'F' : undefined}
                >
                  <MonoIcon className="mr-2 shrink-0" type={'Forward'} />
                  {t('message_card.forward')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

MessageCard.displayName = 'MessageCard';
export default MessageCard;
