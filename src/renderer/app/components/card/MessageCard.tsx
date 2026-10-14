import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import unsubscribeApi from '@/main/api/unsubscribe/unsubscribeApi';
import electronApi from '@/renderer/app/lib/electronApi';
import { useTrackingAtom } from '@/renderer/app/store/tracking/useTrackingAtom';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { IMonoMessage, MonoMessage } from '@/main/models/message/MonoMessage';
import { parsePayloadPartWithHighlight } from '@/main/models/message/parsePayloadPartWithHighlight';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import {
  formatFullDateTime,
  formatListDate,
  formatMessageCardDate,
  formatRelativeTime
} from '@/renderer/app/lib/formatDate';
import { isCalendarAttachment } from '@/renderer/app/lib/icsParser';
import { cleanHistorySnippet, MessageStackPosition } from '@/renderer/app/lib/messageHistory';
import { buildReplyAllRecipients, replySubject } from '@/renderer/app/lib/replyRecipients';
import { payloadHasBodyData } from '@/renderer/app/lib/threadBodyPrefetch';
import { cn } from '@/renderer/app/lib/utils';
import i18n from '@/renderer/assets/locales';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Forward, Reply, ReplyAll } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Collapsible } from '@radix-ui/react-collapsible';
import { CollapsibleContent, CollapsibleTrigger } from '@/renderer/app/components/ui/collapsible';
import { TooltipPortal } from '@radix-ui/react-tooltip';

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
  /** Reports the card's own collapse state (it toggles itself on click). */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Position in a stack of adjacent collapsed rows; joins their edges. */
  stack?: MessageStackPosition | null;
  handleContactOpen?: (recipient: MonoRecipient) => void;
  style?: React.CSSProperties;
  /** The thread's full body is still being fetched (shows a skeleton). */
  bodyLoading?: boolean;
}

// Collapsed content stays mounted (for the height animation), so it's made
// inert: its links and buttons leave the Tab order. React 18 has no typed
// `inert` prop; it passes the string attribute through.
const inertWhen = (condition: boolean) =>
  (condition ? { inert: '' } : {}) as React.HTMLAttributes<HTMLDivElement>;

// "Name (email)", or just the email when there's no name.
const formatRecipient = (recipient: MonoRecipient) =>
  recipient.name ? `${recipient.name} (${recipient.email})` : recipient.email;

// Above this many Cc/Bcc recipients the detail rows collapse behind a toggle.
const INLINE_RECIPIENT_LIMIT = 5;

const ALLOWED_INLINE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const shouldTransformEmailForDarkMode = false;

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

/** One recipient in the details block, with copy / new-email actions. */
const RecipientDetail = ({
  recipient,
  preview,
  onNewEmail
}: {
  recipient: MonoRecipient;
  preview?: boolean;
  onNewEmail: (recipient: MonoRecipient) => void;
}) => {
  const { t } = useTranslation();
  if (preview) return <span className="text-xs">{formatRecipient(recipient)}</span>;
  return (
    <div className="group/email flex items-center gap-1">
      <span className="select-text text-xs">{formatRecipient(recipient)}</span>
      {/* Revealed on hover, and when one of its buttons has keyboard focus. */}
      <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/email:opacity-100">
        <CopyButton
          sizeVariant="xxs"
          textToCopy={recipient.email}
          tooltip={t('contact_card.copy')}
        />
        <Button
          typeVariant={'icon'}
          variant={'ghost'}
          sizeVariant={'xxs'}
          tooltip={t('contact_card.new_email')}
          onClick={() => onNewEmail(recipient)}
        >
          <MonoIcon className="h-3.5 w-3.5 text-muted-foreground" type={'Edit'} />
        </Button>
      </div>
    </div>
  );
};

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
      onFocusRequest,
      onCollapsedChange,
      stack,
      accountId,
      draft,
      contactToggle,
      style,
      bodyLoading
    },
    forwardedRef
  ) => {
    const { t } = useTranslation();
    const { currentTheme } = useTheme(); // Get dark mode state from theme store
    const { globalSearchQuery } = useGlobalAtom();
    const { setGlobalDraftWindows } = useComposeWindowAtom();
    const { accounts } = useAuth();

    const [isCollapsed, setIsCollapsed] = useState(collapsed);
    const onCollapsedChangeRef = useRef(onCollapsedChange);
    onCollapsedChangeRef.current = onCollapsedChange;
    useEffect(() => {
      onCollapsedChangeRef.current?.(!!isCollapsed);
    }, [isCollapsed]);
    const [showQuotedContent, setShowQuotedContent] = useState(false);
    const [showCcDropdown, setShowCcDropdown] = useState(false);
    const [showBccDropdown, setShowBccDropdown] = useState(false);
    // The To/Reply-to/Cc/Bcc detail rows are collapsed by default; the user
    // expands them by clicking the recipient summary line. The message body
    // stays visible regardless — this only toggles the header detail block.
    const [showRecipientDetails, setShowRecipientDetails] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRef = useRef<HTMLDivElement | null>(null);
    const messageContentRef = useRef<HTMLDivElement>(null);
    const quotedContentRef = useRef<HTMLDivElement>(null);
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

    const handleClickNewEmail = (recipient: MonoRecipient) => {
      // Send from the account this message belongs to (not just the first
      // connected account), falling back to the first one.
      const userEmail =
        (accountId ? accounts.find((account) => account.uid === accountId)?.email : undefined) ??
        accounts[0]?.email ??
        '';
      executeCommand('COMPOSE_NEW_MESSAGE', {
        draft: new MonoDraft({ from: userEmail, to: [recipient.email] })
      });
    };

    const showHeaderMessageActions =
      !isCollapsed && !preview && !item.labelIds.includes('DRAFT') && !draft;

    const handleReplyMessage = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setIsCollapsed(false);
      onFocusRequest?.();
      executeCommand('COMPOSE_REPLY_MESSAGE', {
        message: item,
        accountId: accountId
      });
    };

    const handleReplyAllMessage = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      const accountEmail =
        (accountId ? accounts.find((account) => account.uid === accountId)?.email : undefined) ??
        accounts[0]?.email;

      if (!accountEmail) return;

      const ownEmails = new Set(accounts.map((account) => account.email.toLowerCase()));
      ownEmails.add(accountEmail.toLowerCase());
      const { to, cc } = buildReplyAllRecipients(item, ownEmails);

      setIsCollapsed(false);
      onFocusRequest?.();
      setGlobalDraftWindows([
        new MonoDraft({
          from: accountEmail,
          messageId: item.id,
          threadId: item.threadId,
          to,
          cc,
          subject: replySubject(item.subject)
        })
      ]);
    };

    const handleForwardMessage = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setIsCollapsed(false);
      onFocusRequest?.();
      executeCommand('COMPOSE_FORWARD_MESSAGE', {
        message: item,
        accountId: accountId
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
        // The email paper is always light (bg-white, color-scheme light), so
        // theme tokens would render dark-on-white in dark mode.
        fallback.className =
          'my-2 inline-flex min-h-[72px] max-w-full items-center rounded-md border border-[#e7e5e4] bg-[#fafaf9] px-3 py-2 text-xs text-[#78716c]';
        fallback.textContent = i18n.t('message_card.image_unavailable', {
          defaultValue: 'Image unavailable'
        });
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
        skeleton.className = 'my-2 animate-pulse rounded-md';
        skeleton.style.background = '#efedec'; // light paper, see markImageUnavailable

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
          if (abortController.signal.aborted) {
            // The effect was torn down mid-fetch (a re-render / dep change
            // aborted us). Undo the loading state so the re-created effect
            // retries — otherwise the skeleton stays forever and the
            // monoInlineState==='loading' guard makes every retry a no-op.
            skeleton.remove();
            img.style.display = '';
            delete img.dataset.monoInlineState;
            return;
          }

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
          // Must be eager: the image is display:none behind its skeleton, and
          // Chromium never loads a `loading="lazy"` image that isn't rendered —
          // onload never fired and the skeleton stayed forever. Laziness is
          // already handled by the IntersectionObserver that called us.
          img.loading = 'eager';
          img.src = `data:${inlineImage.mimeType};base64,${inlineAttachment.data}`;
        } catch (error) {
          if (abortController.signal.aborted) {
            // Aborted by teardown — reset so the re-created effect can retry
            // instead of leaving a stuck skeleton.
            skeleton.remove();
            img.style.display = '';
            delete img.dataset.monoInlineState;
          } else {
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
      // item.inlineImages intentionally omitted: it is stable per item.id, and
      // including it re-ran this effect on every render (its object identity
      // churns), which aborted the in-flight inline-image fetch before it could
      // finish — leaving the loading skeleton stuck forever. isDarkMode is also
      // omitted (only used for a cosmetic image border) to avoid the same churn.
      parsedPayload?.content,
      showQuotedContent
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

        // Never force an expanded message to 0px. If the content hasn't been
        // measured yet (scrollHeight 0), fall back to natural height so the body
        // can't end up rendered-but-invisible.
        containerRef.current.style.height = isCollapsed
          ? '0px'
          : contentHeight > 0
            ? `${contentHeight}px`
            : 'auto';
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
      // Also follow the content itself: the container is pinned to a measured
      // pixel height, so content that grows after measurement (expanded
      // recipient details, a calendar card that loads async) was clipped.
      if (contentRef.current) {
        resizeObserver.observe(contentRef.current);
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
      showQuotedContent,
      showBccDropdown,
      showCcDropdown,
      showTrackingDropdown,
      showTrackerPrevention,
      draft,
      contactToggle,
      showRecipientDetails
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

      const markRemoteImageUnavailable = (img: HTMLImageElement) => {
        if (img.dataset.monoRemoteImageState === 'error') return;

        img.dataset.monoRemoteImageState = 'error';
        img.removeAttribute('src');
        img.style.display = 'none';

        const fallback = document.createElement('div');
        fallback.className =
          'my-2 inline-flex min-h-[72px] max-w-full items-center rounded-md border border-[#e7e5e4] bg-[#fafaf9] px-3 py-2 text-xs text-[#78716c]';
        fallback.textContent = i18n.t('message_card.image_unavailable', {
          defaultValue: 'Image unavailable'
        });
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

      // Attach a one-shot error handler per render. A failed load shows the
      // fallback for THIS view only; reopening the message re-attempts the
      // image, so a transient network blip does not permanently hide it.
      // (A module-level Set previously suppressed the URL for the whole
      // session with no retry — one hiccup left the image broken until
      // restart.)
      const cleanups = images.map((img) => {
        const src = img.getAttribute('src');
        if (!src) return () => {};

        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';

        const handleError = () => markRemoteImageUnavailable(img);
        img.addEventListener('error', handleError, { once: true });
        return () => img.removeEventListener('error', handleError);
      });

      return () => {
        cleanups.forEach((cleanup) => cleanup());
      };
    }, [parsedPayload?.content, showQuotedContent]);

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
    const hasUnsubscribeTarget =
      (currentMessage.listUnsubscribe?.url.length ?? 0) > 0 ||
      (currentMessage.listUnsubscribe?.mailTo?.length ?? 0) > 0;

    // Unsubscribing is a one-click network action, so it asks first (inline,
    // next to the button) and ignores repeat clicks while it runs.
    const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);
    const [isUnsubscribing, setIsUnsubscribing] = useState(false);

    const handleUnsubscribe = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isUnsubscribing) return;
      setConfirmUnsubscribe(false);
      setIsUnsubscribing(true);

      const uuid = `unsubscribe-${currentMessage.id}`;

      const unsubscribePromise = async (): Promise<{ mode: 'https' | 'mailto' }> => {
        if (!accountId) throw new Error('No account found');
        if (!hasUnsubscribeTarget) {
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
        // The header parser files mailto: entries under `mailTo` with the
        // scheme stripped, so the old lookup in `url` never found one.
        const mailtoAddress = currentMessage.listUnsubscribe.mailTo?.[0];
        const mailtoUrl = mailtoAddress ? `mailto:${mailtoAddress}` : undefined;

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

      const run = unsubscribePromise().finally(() => setIsUnsubscribing(false));
      toast.promise(run, {
        id: uuid,
        loading: t('message_card.unsubscribing', { defaultValue: 'Unsubscribing…' }),
        success: (result) =>
          result.mode === 'mailto'
            ? t('message_card.unsubscribe_mailto_opened', {
                defaultValue: 'Opened the unsubscribe email'
              })
            : t('message_card.unsubscribe_done', { defaultValue: 'Unsubscribed' }),
        error: (err) =>
          t('message_card.unsubscribe_failed', {
            defaultValue: 'Couldn’t unsubscribe: {{error}}',
            error: err.message
          })
      });
    };

    useEffect(() => {
      const fetchUnsubscribeInfo = async () => {
        if (accountId && currentMessage.labelIds.includes('CATEGORY_PROMOTIONS') && !isCollapsed) {
          setUnsubscribedLoading(true);
          apiClient.setApiActiveUid(accountId);

          // Provider-native List-Unsubscribe info needs no backend — fetch it
          // first so the Unsubscribe button still works in a standalone build.
          // The backend-only "already unsubscribed" check below is best-effort
          // on top and must not gate this call.
          try {
            const unsubscribeInfo = await mailApi.getMessageUnsubscribe(
              accountId,
              currentMessage.id
            );
            if (unsubscribeInfo?.listUnsubscribe) {
              setCurrentMessage((prev) => ({
                ...prev,
                listUnsubscribe: unsubscribeInfo.listUnsubscribe
              }));
            }
          } catch (error) {
            console.error('Failed to get provider unsubscribe info:', error);
          }

          try {
            const unsubscribedCheck = await unsubscribeApi.checkUnsubscribedEmail({
              email: currentMessage.from.email
            });
            setIsUnsubscribed(unsubscribedCheck);
          } catch (error) {
            console.error('Failed to check unsubscribed status:', error);
          }

          setTimeout(() => {
            setUnsubscribedLoading(false);
          }, 0);
        } else {
          // Nothing to fetch (not a promotion, or collapsed). Leaving the flag
          // at its initial `true` kept the button invisible yet tabbable for
          // newsletters in Updates/Primary that carry a List-Unsubscribe header.
          setUnsubscribedLoading(false);
        }
      };

      fetchUnsubscribeInfo();
      // isCollapsed: a promotion first rendered collapsed must fetch when expanded.
    }, [currentMessage.id, isCollapsed]);

    // Your own messages show your account photo, like the inbox rows.
    const senderImageSrc = useMemo(() => {
      const senderEmail = currentMessage.from?.email?.trim().toLowerCase();
      if (!senderEmail) return null;
      return (
        accounts.find((account) => account.email.trim().toLowerCase() === senderEmail)
          ?.profileImageUrl ?? null
      );
    }, [accounts, currentMessage.from?.email]);
    // R replies to the latest message from someone else, so only hint it on
    // the newest card when that card isn't yours.
    const fromSelf = accounts.some(
      (account) =>
        account.email.trim().toLowerCase() === currentMessage.from?.email?.trim().toLowerCase()
    );
    const showReplyHint = !!isLastCard && !fromSelf;
    const showBodySkeleton = !!bodyLoading && !payloadHasBodyData(item.payload);

    const senderName =
      currentMessage.from && currentMessage.from.name.length > 0
        ? currentMessage.from.name[0].toUpperCase() + currentMessage.from.name.slice(1)
        : currentMessage.from.email.split('@')[0];
    const attachmentCount = Object.values(currentMessage.attachments).length;
    const messageDate = currentMessage.timestamp ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            className="shrink-0 cursor-default whitespace-nowrap text-[11px] tabular-nums"
            dateTime={new Date(currentMessage.timestamp).toISOString()}
          >
            {formatMessageCardDate(currentMessage.timestamp)}
          </time>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom">
            {formatFullDateTime(currentMessage.timestamp)}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    ) : null;
    // A collapsed card inside a stack of collapsed rows joins its neighbours:
    // inner corners squared, the shared edge drawn once (by the row above).
    const stackClasses =
      isCollapsed && stack
        ? {
            // Only the bottom row keeps the drop shadow; a shadow per row fell
            // across the next one as a grey band.
            single: '',
            first: 'rounded-b-none shadow-none',
            middle: 'rounded-none border-t-0 shadow-none',
            last: 'rounded-t-none border-t-0'
          }[stack]
        : '';

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
            // A sheet of paper on the reader well: white card, hairline edge
            // and a soft two-layer shadow that lifts it off the tinted well
            // (subtler than the old chunky `shadow-lg`). In dark themes the
            // lighter --card on the darker well does the lifting instead.
            'duration-50 overflow-hidden border-foreground/[0.06] bg-card transition-all',
            'shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_10px_28px_-14px_hsl(var(--foreground)/0.14)]',
            'dark:border-white/[0.06] dark:shadow-none',
            ringVariants,
            draft && 'mb-2',
            cardClassName,
            stackClasses
          )}
          onKeyDown={(e) => {
            // Only when the card itself is focused — Enter on a link, button or
            // attachment chip inside the message must not also collapse it.
            if (e.key === 'Enter' && e.target === e.currentTarget) setIsCollapsed(!isCollapsed);
          }}
          style={style}
        >
          <CardHeader
            className={cn(
              isCollapsed
                ? cn(
                    'cursor-pointer px-4 py-2.5 transition-colors pointer-hover:bg-foreground/[0.025] dark:pointer-hover:bg-foreground/[0.04] sm:px-5',
                    ringVariants
                  )
                : 'p-4 sm:p-5'
            )}
            {...(isCollapsed
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-expanded': false,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    // Not also Reply All (Enter) / scroll (Space) in the reader.
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCollapsed(false);
                    onFocusRequest?.();
                  }
                }
              : {})}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCollapsed) {
                // Selecting the sender / email to copy it mustn't collapse the
                // message: skip clicks on that text and drag-selections here.
                if ((e.target as HTMLElement).closest?.('[data-select-text]')) return;
                const selection = window.getSelection();
                if (
                  selection &&
                  !selection.isCollapsed &&
                  (e.currentTarget.contains(selection.anchorNode) ||
                    e.currentTarget.contains(selection.focusNode))
                ) {
                  return;
                }
              }
              setIsCollapsed(!isCollapsed);
              onFocusRequest?.();
            }}
          >
            {isCollapsed ? (
              // History row: one quiet line per older message — who, the
              // reply's own words (quoted history and "Sent from my…" cut
              // off), a paperclip if it carries files, and when. Click to
              // expand it in place.
              <div className="flex h-6 items-center gap-2.5 text-[13px]">
                <RecipientAvatar
                  recipient={currentMessage.from}
                  accountId={accountId}
                  preferredImageSrc={senderImageSrc}
                  className="h-6 w-6 shrink-0 text-[10px]"
                />
                <span
                  className={cn(
                    'max-w-[40%] shrink-0 truncate tracking-tight text-foreground',
                    currentMessage.labelIds.includes('UNREAD') ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {senderName}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {cleanHistorySnippet(currentMessage.snippet)}
                </span>
                {attachmentCount > 0 && (
                  <MonoIcon
                    type={'Paperclip'}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                  />
                )}
                <span className="text-muted-foreground">{messageDate}</span>
              </div>
            ) : (
              <>
                {/* Newton sender row: avatar + sender name (tracking-tight,
                medium weight) + sender email (muted, hidden when
                collapsed to leave space for snippet). Timestamp on the
                right in mono tabular-nums. */}
                <div className="flex items-center gap-3 text-sm">
                  <RecipientAvatar
                    recipient={currentMessage.from}
                    accountId={accountId}
                    preferredImageSrc={senderImageSrc}
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 overflow-hidden text-ellipsis">
                      <div className="flex items-baseline gap-2 whitespace-nowrap">
                        <span
                          data-select-text
                          className="select-text text-[14px] font-medium tracking-tight text-foreground"
                        >
                          {senderName}
                        </span>
                        {!isCollapsed && currentMessage.from?.name?.length > 0 && (
                          <span
                            data-select-text
                            className="hidden select-text text-[12px] text-muted-foreground sm:inline"
                          >
                            {currentMessage.from.email}
                          </span>
                        )}
                      </div>
                      {/* {currentMessage.id} / {currentMessage.threadId} */}
                      {!isCollapsed &&
                        hasUnsubscribeTarget &&
                        !isUnsubscribed &&
                        (confirmUnsubscribe ? (
                          <div
                            className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="whitespace-nowrap">
                              {t('message_card.unsubscribe_confirm', {
                                defaultValue: 'Stop emails from this list?'
                              })}
                            </span>
                            <Button
                              variant={'outline'}
                              sizeVariant={'xs'}
                              disabled={isUnsubscribing}
                              onClick={handleUnsubscribe}
                            >
                              {t('message_card.unsubscribe', { defaultValue: 'Unsubscribe' })}
                            </Button>
                            <Button
                              variant={'ghost'}
                              sizeVariant={'xs'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmUnsubscribe(false);
                              }}
                            >
                              {t('common.cancel', { defaultValue: 'Cancel' })}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmUnsubscribe(true);
                            }}
                            variant={'outline'}
                            sizeVariant={'xs'}
                            disabled={isUnsubscribing}
                            className={cn(
                              'no-drag text-muted-foreground transition-all duration-300 hover:text-foreground',
                              unsubscribedLoading ? 'pointer-events-none opacity-0' : 'opacity-100'
                            )}
                          >
                            {t('message_card.unsubscribe', { defaultValue: 'Unsubscribe' })}
                          </Button>
                        ))}
                      {!isCollapsed && hasUnsubscribeTarget && isUnsubscribed && (
                        <div
                          className={cn(
                            'flex items-center gap-1 overflow-hidden text-ellipsis rounded-md border px-2 py-1 text-xs text-muted-foreground transition-all duration-300',
                            unsubscribedLoading ? 'pointer-events-none opacity-0' : 'opacity-100'
                          )}
                        >
                          <MonoIcon type={'Check'} className="h-3.5 w-3.5" />
                          <div className="flex-1 overflow-hidden text-ellipsis">
                            <span className="whitespace-nowrap">
                              {t('message_card.unsubscribed_from', {
                                defaultValue: 'Unsubscribed from {{email}}',
                                email: currentMessage.from.email
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                      {currentMessage.timestamp && (
                        <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                          {showHeaderMessageActions && (
                            <div
                              className="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-all duration-150 focus-within:max-w-[88px] focus-within:opacity-100 group-hover:max-w-[88px] group-hover:opacity-100"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                typeVariant="icon"
                                sizeVariant="xs"
                                variant="ghost"
                                className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted-low hover:text-foreground"
                                tooltipSide="bottom"
                                tooltip={t('message_card.reply')}
                                shortcut={showReplyHint ? 'R' : undefined}
                                onClick={handleReplyMessage}
                              >
                                <Reply className="h-4 w-4" strokeWidth={1.8} />
                              </Button>
                              <Button
                                typeVariant="icon"
                                sizeVariant="xs"
                                variant="ghost"
                                className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted-low hover:text-foreground"
                                tooltipSide="bottom"
                                tooltip={t('message_card.reply_all', { defaultValue: 'Reply all' })}
                                shortcut={isLastCard ? 'Enter' : undefined}
                                onClick={handleReplyAllMessage}
                              >
                                <ReplyAll className="h-4 w-4" strokeWidth={1.8} />
                              </Button>
                              <Button
                                typeVariant="icon"
                                sizeVariant="xs"
                                variant="ghost"
                                className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted-low hover:text-foreground"
                                tooltipSide="bottom"
                                tooltip={t('message_card.forward')}
                                shortcut={isLastCard ? 'F' : undefined}
                                onClick={handleForwardMessage}
                              >
                                <Forward className="h-4 w-4" strokeWidth={1.8} />
                              </Button>
                            </div>
                          )}
                          {messageDate}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardHeader>

          {/* Use currentMessage instead of item in the content */}
          <div
            ref={containerRef}
            className="transition-height overflow-hidden duration-300 ease-bouncy-in-out"
            {...inertWhen(!!isCollapsed)}
          >
            <div ref={contentRef}>
              <div className={cn('ml-12 grid gap-1 px-4 pb-4 pt-0', isCollapsed ? '' : '')}>
                {!preview && !showRecipientDetails && (
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRecipientDetails(true);
                    }}
                    className="inline-flex w-fit items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="font-medium">{t('message_card.to')}:</span>
                    <span className="max-w-[52ch] truncate text-foreground">
                      {currentMessage.to.length === 0
                        ? `(${t('message_card.no_recipient')})`
                        : currentMessage.to
                            .map((r) => r.name || r.email)
                            .slice(0, 2)
                            .join(', ')}
                      {(() => {
                        const hidden =
                          Math.max(0, currentMessage.to.length - 2) +
                          (currentMessage.cc?.length ?? 0);
                        return hidden > 0 ? ` +${hidden}` : '';
                      })()}
                    </span>
                    <MonoIcon type="ChevronDown" className="h-3 w-3" />
                  </button>
                )}
                {(preview || showRecipientDetails) && (
                  <>
                    <div className="inline-flex items-start gap-1 text-xs">
                      <span className="mt-0.5 font-medium text-muted-foreground">
                        {t('message_card.to')}:
                      </span>{' '}
                      <div className="flex flex-col">
                        {currentMessage.to.length === 0 ? (
                          <span>({t('message_card.no_recipient')})</span>
                        ) : (
                          currentMessage.to.map((recipient) => (
                            <span key={recipient.email} className="mr-1">
                              <RecipientDetail
                                recipient={recipient}
                                preview={preview}
                                onNewEmail={handleClickNewEmail}
                              />
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    {/* The sender (there's no separate Reply-To in the model). */}
                    <div className="inline-flex items-center gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">
                        {t('message_card.from', { defaultValue: 'From' })}:
                      </span>{' '}
                      {currentMessage.from && (
                        <RecipientDetail
                          recipient={currentMessage.from}
                          preview={preview}
                          onNewEmail={handleClickNewEmail}
                        />
                      )}
                    </div>

                    {(
                      [
                        ['cc', currentMessage.cc, showCcDropdown, setShowCcDropdown],
                        ['bcc', currentMessage.bcc, showBccDropdown, setShowBccDropdown]
                      ] as const
                    ).map(([field, recipients, expanded, setExpanded]) =>
                      recipients && recipients.length > 0 ? (
                        <div key={field} className="inline-flex items-start gap-1 text-xs">
                          <span className="mt-0.5 font-medium text-muted-foreground">
                            {t(`message_card.${field}`)}:
                          </span>{' '}
                          {/* Listed like To; only long lists hide behind a toggle. */}
                          {recipients.length <= INLINE_RECIPIENT_LIMIT || expanded ? (
                            <div className="flex flex-col">
                              {recipients.map((recipient) => (
                                <span key={recipient.email} className="mr-1">
                                  <RecipientDetail
                                    recipient={recipient}
                                    preview={preview}
                                    onNewEmail={handleClickNewEmail}
                                  />
                                </span>
                              ))}
                              {recipients.length > INLINE_RECIPIENT_LIMIT && (
                                <Button
                                  className="h-auto w-fit p-0 text-xs"
                                  variant="link"
                                  typeVariant={'inline'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(false);
                                  }}
                                >
                                  {t('message_card.show_fewer', { defaultValue: 'Show fewer' })}
                                  <MonoIcon type="ChevronUp" className="ml-1 h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button
                              className="h-auto select-text p-0 text-xs"
                              variant="link"
                              typeVariant={'inline'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(true);
                              }}
                            >
                              {t('message_card.recipients', { count: recipients.length })}
                              <MonoIcon type="ChevronDown" className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : null
                    )}
                    {!preview && (
                      <button
                        type="button"
                        aria-expanded={true}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRecipientDetails(false);
                        }}
                        className="inline-flex w-fit items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t('message_card.hide_details', { defaultValue: 'Hide details' })}
                        <MonoIcon type="ChevronUp" className="h-3 w-3" />
                      </button>
                    )}
                  </>
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
                        // Seen more than once - show text-foreground with read count
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
                              className="mr-1 h-3 w-3 text-foreground"
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
                  !isCollapsed &&
                  Object.values(currentMessage.attachments).length > 0 &&
                  accountId &&
                  Object.values(currentMessage.attachments).some((att) =>
                    isCalendarAttachment(att)
                  ) && (
                    <div className="mx-4 mb-3 flex-1 sm:mx-5">
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
                      <div className="mx-4 mb-4 flex items-center gap-2 rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:mx-5">
                        <Collapsible
                          className="w-full"
                          open={showTrackerPrevention}
                          onOpenChange={setShowTrackerPrevention}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              className={cn(
                                'group/tracker flex w-full items-center gap-2 rounded-sm text-left',
                                ringVariants
                              )}
                            >
                              <MonoIcon type={'Shield'} className="h-4 w-4 shrink-0" />
                              <span className="line-clamp-1">
                                {t(
                                  parsedPayload.trackingImagesRemoved === 1
                                    ? 'message_card.privacy_protection_one'
                                    : 'message_card.privacy_protection_other',
                                  { count: parsedPayload.trackingImagesRemoved }
                                )}
                              </span>
                              <MonoIcon
                                type={'ChevronDown'}
                                className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/tracker:rotate-180"
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-2 pl-6 pt-2">
                              {parsedPayload.trackingDomains &&
                              parsedPayload.trackingDomains.length > 0 ? (
                                parsedPayload.trackingDomains.map((domain, index) => (
                                  <div key={index} className="flex items-center gap-2">
                                    <span className="line-clamp-1">
                                      {t('message_card.tracker_removed_from', {
                                        defaultValue: 'Tracker removed from'
                                      })}{' '}
                                      <span className="font-medium text-foreground">{domain}</span>
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>
                                    {t('message_card.trackers_removed', {
                                      defaultValue: 'Trackers removed'
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )
                  : null}
                <div className="overflow-hidden px-4 pb-4 sm:px-5">
                  {showBodySkeleton && (
                    // Body still on its way: placeholder lines instead of an
                    // empty white sheet.
                    <div
                      role="status"
                      aria-label={t('message_card.loading_body', {
                        defaultValue: 'Loading message…'
                      })}
                      className="space-y-2.5 px-4 py-3"
                    >
                      <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'email-document overflow-x-auto bg-white px-4 py-3 text-[#202124] dark:rounded-lg',
                      showBodySkeleton && 'hidden'
                    )}
                  >
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
                    <div className="px-4 pb-4 pt-0 sm:px-5">
                      <Button
                        aria-expanded={showQuotedContent}
                        className="h-7 gap-1.5 rounded px-2 text-xs text-muted-foreground hover:text-foreground"
                        variant="ghost"
                        tooltip={t(
                          showQuotedContent
                            ? 'message_card.hide_quoted'
                            : 'message_card.show_quoted'
                        )}
                        typeVariant={'inline'}
                        onClick={() => setShowQuotedContent(!showQuotedContent)}
                      >
                        <MonoIcon
                          type={showQuotedContent ? 'ChevronUp' : 'ChevronDown'}
                          className="h-3.5 w-3.5"
                        />
                        <span>
                          {t(
                            showQuotedContent
                              ? 'message_card.hide_quoted'
                              : 'message_card.show_quoted'
                          )}
                        </span>
                      </Button>
                    </div>

                    <div
                      className={cn(
                        'overflow-hidden transition-opacity duration-150',
                        showQuotedContent ? 'px-4 pb-6 pt-0 opacity-100 sm:px-5' : 'h-0 opacity-0'
                      )}
                      {...inertWhen(!showQuotedContent)}
                    >
                      <div className="email-document overflow-x-auto bg-white px-4 py-3 text-[#202124] dark:rounded-lg">
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

          {/* Attachments: a collapsed row shows a paperclip instead. */}
          {!isCollapsed && attachmentCount > 0 && (
            <CardFooter className="flex flex-col items-start gap-3 px-4 py-4 sm:px-5">
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
      </div>
    );
  }
);

MessageCard.displayName = 'MessageCard';
export default MessageCard;
