// Updated GlobalComposeCard.tsx
import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoAttachment } from '@/main/models/types';
import { generateUUID, isComposeDraftId } from '@/main/utils'; // Import getUidFromEmail
import tailwindCSS from '@/renderer/app/assets/style/tailwind.css?raw';
import ComposeCardFooter from '@/renderer/app/components/card/compose/ComposeCardFooter';
import ComposeCardHeader from '@/renderer/app/components/card/compose/ComposeCardHeader';
import ReferenceCard from '@/renderer/app/components/card/compose/ReferenceCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import SignatureSwitcher from '@/renderer/app/components/mail/SignatureSwitcher';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import { Input } from '@/renderer/app/components/ui/input';
import Loader from '@/renderer/app/components/ui/loader';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useDiscardDraftWithUndo } from '@/renderer/app/hooks/useDiscardDraftWithUndo';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import {
  DBDeleteAttachmentBlob,
  DBSaveAttachmentBlob
} from '@/renderer/app/lib/db/draftAttachment';
import { DBGetMessage, DBSaveMessage } from '@/renderer/app/lib/db/message';
import { formatForwardedMessage } from '@/renderer/app/lib/formatBody';
import { getAttachmentIcon } from '@/renderer/app/lib/getAttachmentIcon';
import { hasModKey } from '@/renderer/app/lib/platform';
import {
  GMAIL_MAX_FILE_BYTES,
  MICROSOFT_ATTACHMENT_BUDGET_BYTES,
  MICROSOFT_MAX_ENCODED_MIME,
  estimateMicrosoftRequestSize,
  formatLimit,
  measureHtmlBody
} from '@/renderer/app/lib/sendSizeLimits';
import { cn } from '@/renderer/app/lib/utils';
import {
  globalDraftWindowsAtom,
  useComposeWindowAtom
} from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useStore } from 'jotai';
import juice from 'juice';
import { debounce } from 'lodash';
import React, {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { insertPlainText } from '@/renderer/app/lib/text-editor/PlainTextPasteExtension';

// Lazy load the TextEditor component
const TextEditor = lazy(() => import('@/renderer/app/containers/editor/TextEditor'));

interface GlobalComposeCardProps {
  className?: string;
  draft?: MonoDraft;
}

interface MonoAttachmentWithStatus extends MonoAttachment {
  status: 'loading' | 'success' | 'invalid';
  errorMessage?: string;
}

type ComposeKind = 'new' | 'reply' | 'forward';

type SendBlock = {
  reason: string;
  kind:
    | 'no_sender'
    | 'expired'
    | 'no_recipients'
    | 'uploading'
    | 'failed_attachment'
    | 'too_large'
    | 'forward_loading';
} | null;

const formatAttachmentSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const filesToFileList = (files: File[]): FileList => {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* files;
    }
  } as unknown as FileList;

  files.forEach((file, index) => {
    (fileList as unknown as Record<number, File>)[index] = file;
  });

  return fileList;
};

const getDraggedFiles = (dataTransfer: DataTransfer): File[] => {
  const fileMap = new Map<string, File>();

  Array.from(dataTransfer.files).forEach((file) => {
    fileMap.set(`${file.name}-${file.size}-${file.lastModified}-${file.type}`, file);
  });

  Array.from(dataTransfer.items).forEach((item) => {
    if (item.kind !== 'file') return;

    const file = item.getAsFile();
    if (file) {
      fileMap.set(`${file.name}-${file.size}-${file.lastModified}-${file.type}`, file);
    }
  });

  return Array.from(fileMap.values());
};

// What the user can actually change. signatureId (set by the default-signature
// switcher on open), timestamp and the thread/message ids (rewritten by the
// first save) change on their own, and comparing them made closing an
// untouched compose ask to "save changes".
const editableSnapshot = (d: MonoDraft) =>
  JSON.stringify({
    from: d.from,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: (d.body ?? '').replace(/<p><\/p>/g, '').trim(),
    attachments: Object.keys(d.attachments ?? {}).sort()
  });

// Matches the editor box (min-h-[210px] px-9 py-4) so the signature and quoted
// message below don't jump when the real editor mounts.
const EditorLoadingFallback = () => (
  <div className="min-h-[210px] animate-pulse">
    <div className="space-y-2 px-9 py-4">
      <div className="h-4 w-3/4 rounded bg-muted"></div>
      <div className="h-4 w-1/2 rounded bg-muted"></div>
      <div className="h-4 w-2/3 rounded bg-muted"></div>
    </div>
  </div>
);

const GlobalComposeCard: React.FC<GlobalComposeCardProps> = ({ className, draft }) => {
  const { preference, getUidFromEmail, accounts, updatePreference } = useAuth();
  const { t } = useTranslation();
  const executeCommand = useExecuteCommand();
  const { signatures } = useSignatureAtom();
  const { openDialog } = useDialogs();
  const { updateDraft, sendDraft, removeDraft, getDraftsForAccount } = useDraftAtom();
  const discardDraftWithUndo = useDiscardDraftWithUndo();
  const { setGlobalDraftWindows, setHandleCloseButton } = useComposeWindowAtom();
  const store = useStore();
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { trackEvent } = useUserTrackingData();
  const [isSending, setIsSending] = useState(false);
  const [isAttachmentDropActive, setIsAttachmentDropActive] = useState(false);
  // Off by default (see defaultPreference.compose.trackReadReceipts) — this was
  // previously hardcoded to `true` with no UI, so every send was silently
  // read-tracked. Per-draft, but persisted as the default for the next compose.
  const [trackingEnabled, setTrackingEnabled] = useState(
    () => preference.compose.trackReadReceipts
  );
  const handleToggleTracking = useCallback(() => {
    setTrackingEnabled((prev) => {
      const next = !prev;
      updatePreference({ compose: { ...preference.compose, trackReadReceipts: next } });
      return next;
    });
  }, [preference.compose, updatePreference]);

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeDraft, setComposeDraft] = React.useState<MonoDraft>(() => {
    const initialDraft = draft ?? new MonoDraft();

    // If no from email is set, set it to the first non-expired account
    if (!initialDraft.from && accounts.length > 0) {
      const nonExpiredAccount = accounts.find((account) => !account.isExpired);
      if (nonExpiredAccount) {
        initialDraft.update({ from: nonExpiredAccount.email });
      }
    }

    return initialDraft;
  });
  // The draft as it opened, for "nothing changed" checks and "Don't save".
  const [openingSnapshot] = useState(() => editableSnapshot(composeDraft));
  // Reply / forward / new is decided once: the subject can be edited later,
  // and re-reading it on every keystroke silently dropped a forward's
  // original when "Fwd:" was removed.
  const [composeKind] = useState<ComposeKind>(() => {
    const subject = draft?.subject ?? '';
    if (/^fwd?:/i.test(subject)) return 'forward';
    if (!draft?.messageId) return 'new';
    // A draft that answers a message but has no recipients is a forward
    // whose "Fwd:" was edited away.
    return (draft.to?.length ?? 0) === 0 ? 'forward' : 'reply';
  });
  const [draftSaveStatus, setDraftSaveStatus] = useState<
    'INITIALIZED' | 'LOADING' | 'SAVED' | 'ERROR'
  >('INITIALIZED');
  const editorRef = useRef<{ setContent: (content: string) => void; focus: () => void } | null>(
    null
  );

  const subjectRef = useRef<HTMLInputElement>(null);
  const composeRootRef = useRef<HTMLDivElement>(null);
  // Where focus was inside compose when it was minimized, to return there.
  const focusBeforeMinimizeRef = useRef<Element | null>(null);
  // What had focus when compose opened, to hand focus back on close.
  const openerRef = useRef<Element | null>(
    typeof document !== 'undefined' ? document.activeElement : null
  );

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      if (!prev) {
        const active = document.activeElement;
        focusBeforeMinimizeRef.current =
          active && composeRootRef.current?.contains(active) ? active : null;
      }
      return !prev;
    });
  }, []);
  const toggleMaximize = useCallback(() => {
    setIsMinimized(false);
    setIsMaximized((prev) => {
      return !prev;
    });
  }, []);

  // Restoring from the minimized bar puts focus back where it was (the editor
  // keeps its caret and undo history: it stays mounted while minimized).
  const wasMinimizedRef = useRef(false);
  useEffect(() => {
    if (isMinimized) {
      wasMinimizedRef.current = true;
      return;
    }
    if (!wasMinimizedRef.current) return;
    wasMinimizedRef.current = false;
    const target = focusBeforeMinimizeRef.current;
    focusBeforeMinimizeRef.current = null;
    if (!(target instanceof HTMLElement) || !target.isConnected) return;
    requestAnimationFrame(() => {
      if (target.closest('.ProseMirror')) editorRef.current?.focus();
      else target.focus({ preventScroll: true });
    });
  }, [isMinimized]);

  // Helper function to handle different draft save errors
  const handleDraftSaveError = useCallback(
    (error: any) => {
      console.error('Error saving draft:', error);

      // One toast for a streak of failed autosaves, not one per pause.
      const id = 'draft-save-error';
      // Check for specific error types
      if (error?.status === 500 && error?.data?.includes?.('Refresh token expired')) {
        toast.error(t('toast.error.account_expired'), { id });
      } else if (error?.status === 500 && error?.data?.includes?.('Re-authentication required')) {
        toast.error(t('toast.error.account_expired'), { id });
      } else if (error?.status === 401 || error?.status === 403) {
        toast.error(t('toast.error.account_expired'), { id });
      } else {
        toast.error(t('toast.error.save_draft'), { id });
      }
    },
    [t]
  );

  // The save currently writing to the store. Send waits for it, so an
  // autosave finishing after sendDraft can't put the draft back in Drafts.
  const inFlightSaveRef = useRef<Promise<unknown> | null>(null);
  const trackSave = useCallback(<T,>(save: Promise<T>): Promise<T> => {
    inFlightSaveRef.current = save;
    const clear = () => {
      if (inFlightSaveRef.current === save) inFlightSaveRef.current = null;
    };
    save.then(clear, clear);
    return save;
  }, []);

  const updateMessage = async (draft: MonoDraft) => {
    const uid = getUidFromEmail(draft.from);
    if (draft.from && uid) {
      apiClient.setApiActiveUid(uid);
      try {
        setDraftSaveStatus('LOADING');
        await trackSave(updateDraft(uid, draft, true, true));
        setComposeDraft(draft);
        setDraftSaveStatus('SAVED');
        trackEvent('email_draft_saved', {
          draft_id: draft.id,
          thread_id: draft.threadId,
          has_attachments: Object.keys(draft.attachments).length > 0,
          subject_length: draft.subject.length,
          body_length: draft.body.length
        });
      } catch (error) {
        handleDraftSaveError(error);
        setDraftSaveStatus('ERROR');
      }
    }
  };

  const [isEditorMounted, setIsEditorMounted] = useState(false);
  const mountTimeoutRef = useRef<NodeJS.Timeout>();

  // Delay editor mounting to improve initial render performance
  useEffect(() => {
    mountTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        setIsEditorMounted(true);
      });
    }, 100); // Mount editor after 100ms

    return () => {
      if (mountTimeoutRef.current) {
        clearTimeout(mountTimeoutRef.current);
      }
    };
  }, []);

  // Memoize heavy computations

  // Optimize debounced update function with useCallback
  const debouncedUpdateDraft = useMemo(
    () =>
      debounce(async (draft: MonoDraft) => {
        if (draft.from) {
          const uid = getUidFromEmail(draft.from);
          if (uid) {
            apiClient.setApiActiveUid(uid);
            try {
              setDraftSaveStatus('LOADING');
              await trackSave(updateDraft(uid, draft, true, true));
              setDraftSaveStatus('SAVED');
            } catch (error) {
              handleDraftSaveError(error);
              setDraftSaveStatus('ERROR');
            }
          }
        }
      }, 1000),
    [updateDraft, getUidFromEmail, handleDraftSaveError, trackSave]
  );

  // "Saving" only shows for a save that's actually slow; local saves finish in
  // a few ms and flashed a chip after every pause in typing.
  const [showSavingStatus, setShowSavingStatus] = useState(false);
  useEffect(() => {
    if (draftSaveStatus !== 'LOADING') {
      setShowSavingStatus(false);
      return;
    }
    const timer = setTimeout(() => setShowSavingStatus(true), 400);
    return () => clearTimeout(timer);
  }, [draftSaveStatus]);

  // Whether this draft was already saved before the window opened. "Don't
  // Save" restores that saved copy; a brand-new compose has none, and
  // re-saving the original empty draft left a blank "(No subject)" in Drafts.
  const draftExistedAtOpenRef = useRef<boolean | null>(null);
  if (draftExistedAtOpenRef.current === null && draft?.from) {
    const uid = getUidFromEmail(draft.from);
    draftExistedAtOpenRef.current = !!(uid && getDraftsForAccount(uid)[draft.id]);
  }
  // The opening draft, copied before anything can mutate it.
  const [openingDraft] = useState(() => new MonoDraft(composeDraft.toPlainObject()));

  // Set once the window starts closing (send, discard, close, schedule), so the
  // unmount cleanup knows it wasn't replaced by another compose.
  const closedRef = useRef(false);

  const handleClose = useCallback(() => {
    // A pending autosave firing after close resurrected a just-discarded
    // draft (or kept edits the user chose not to save).
    debouncedUpdateDraft.cancel();
    closedRef.current = true;
    setIsClosing(true);
    setTimeout(() => {
      setGlobalDraftWindows((prev) => prev.filter((win) => win.id !== draft?.id));
      // Hand focus back to whatever opened compose (the list or reader), if
      // it's still on screen — never click or select it.
      const opener = openerRef.current;
      if (
        opener instanceof HTMLElement &&
        opener !== document.body &&
        opener.isConnected &&
        !composeRootRef.current?.contains(opener)
      ) {
        opener.focus({ preventScroll: true });
      }
    }, 400);
  }, [draft, debouncedUpdateDraft]);

  // A new message / forward with no recipients yet should start in To, not
  // the body (the editor's autofocus used to win, so typing went to the body).
  const [focusToOnOpen] = useState(() => (draft?.to?.length ?? 0) === 0);
  // Reopening a draft puts the caret after what's already written.
  const [editorAutofocus] = useState<boolean | 'end'>(() =>
    focusToOnOpen ? false : (draft?.body ?? '').replace(/<p><\/p>/g, '').trim() ? 'end' : true
  );

  const focusToInput = useCallback(() => {
    composeRootRef.current?.querySelector<HTMLInputElement>('[data-compose-to] input')?.focus();
  }, []);

  useEffect(() => {
    setIsVisible(true); // Trigger grow animation
    let attempts = 0;
    const focusInitialField = () => {
      if (!focusToOnOpen) {
        editorRef.current?.focus();
        return;
      }
      const toInput =
        composeRootRef.current?.querySelector<HTMLInputElement>('[data-compose-to] input');
      if (toInput) toInput.focus();
      // The header can mount a frame or two late; never leave nothing focused.
      else if (attempts++ < 10) requestAnimationFrame(focusInitialField);
      else editorRef.current?.focus();
    };
    requestAnimationFrame(focusInitialField);
    activateScope('GLOBAL_COMPOSE');
    return () => {
      deactivateScope('GLOBAL_COMPOSE');
    };
  }, []);
  // Optimize input change handler
  const handleInputChange = useCallback(
    (field: keyof MonoDraft, value: string | string[]) => {
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        updatedDraft.update({
          [field]: field === 'to' || field === 'cc' || field === 'bcc' ? value : value
        });
        debouncedUpdateDraft(updatedDraft);
        return updatedDraft;
      });
    },
    [debouncedUpdateDraft]
  );

  const handleUploadInlineImage = useCallback(async (file: File, uuid: string) => {
    // Standalone: embed inline images as data URIs in the body. buildRawMessage
    // converts them to proper cid: parts at send time (Gmail strips data URIs).
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return {
      inlineImage: {
        [uuid]: {
          attachmentId: uuid,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          url
        }
      }
    };
  }, []);

  // Synchronous once-per-card send guard. `isSending` is state (stale inside a
  // double-click / Cmd+Enter-then-click burst) and was reset in `finally`
  // while the card was still fading out, so a second Send scheduled a second
  // countdown — and Undo then cancelled only one of the two copies.
  const sendStartedRef = useRef(false);

  const [historyMessage, setHistoryMessages] = useState<MonoMessage | null>(null);
  const [replyMessage, setReplyMessages] = useState<MonoMessage | null>(null);
  // Loading state of the message being replied to / forwarded. A forward
  // can't send until its original is in (it's appended to the body), and a
  // failed load re-enables Send with a visible notice, so it's never stuck.
  const [originalStatus, setOriginalStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(
    () => (composeKind !== 'new' && draft?.messageId ? 'loading' : 'idle')
  );
  const [originalAttempt, setOriginalAttempt] = useState(0);
  const loadedOriginalIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetched once per message id — keyed on every composeDraft change, it
  // re-read and re-sanitized the quoted email on each keystroke.
  useEffect(() => {
    const { from, messageId } = composeDraft;
    if (composeKind === 'new' || !from || !messageId) return;
    if (loadedOriginalIdRef.current === messageId) return;

    setOriginalStatus('loading');
    const fetchMessage = async () => {
      try {
        const uid = getUidFromEmail(from);
        if (!uid) throw new Error(`No account for ${from}`);
        let message = await DBGetMessage(uid, messageId);

        // If message doesn't exist in DB, fetch from Gmail API
        if (!message) {
          const messageResponse = await mailApi.getMessage(uid, messageId);

          if (messageResponse?.payload) {
            message = MonoMessage.fromGmailMessage(messageResponse);
            // Save to DB for future use
            await DBSaveMessage(uid, message);
          }
        }
        if (!mountedRef.current) return;
        if (!message) throw new Error('Original message not found');

        loadedOriginalIdRef.current = messageId;
        if (composeKind === 'forward') setHistoryMessages(message);
        else setReplyMessages(message);
        setOriginalStatus('loaded');
      } catch (error) {
        console.error('Error fetching message:', error);
        if (mountedRef.current) setOriginalStatus('failed');
      }
    };

    fetchMessage();
  }, [composeDraft.from, composeDraft.messageId, composeKind, originalAttempt]);

  // State for attachments
  const [attachments, setAttachments] = useState<Record<string, MonoAttachmentWithStatus>>(() =>
    Object.fromEntries(
      Object.entries(composeDraft.attachments).map(([attachmentId, attachment]) => [
        attachmentId,
        {
          ...attachment,
          status: 'success'
        }
      ])
    )
  );

  const sendingAccount = useMemo(
    () => accounts.find((account) => account.email === composeDraft.from) ?? null,
    [accounts, composeDraft.from]
  );
  const isMicrosoftAccount = sendingAccount?.provider === 'microsoft';
  const attachmentBytes = useMemo(
    () =>
      Object.values(composeDraft.attachments).reduce(
        (sum, attachment) => sum + (attachment.size || 0),
        0
      ),
    [composeDraft.attachments]
  );

  // One answer to "why can't I send?", shared by the button, its tooltip and
  // every send shortcut.
  const sendBlock = useMemo<SendBlock>(() => {
    if (!composeDraft.from) {
      return { kind: 'no_sender', reason: t('compose_card.footer.send_disabled.no_sender') };
    }
    if (sendingAccount?.isExpired) {
      return { kind: 'expired', reason: t('tooltips.account_status.authentication_expired') };
    }
    if (composeDraft.to.length === 0) {
      return {
        kind: 'no_recipients',
        reason: t('compose_card.footer.send_disabled.no_recipients')
      };
    }
    const attachmentStates = Object.values(attachments);
    if (attachmentStates.some((attachment) => attachment.status === 'loading')) {
      return { kind: 'uploading', reason: t('compose_card.footer.send_disabled.attaching') };
    }
    if (attachmentStates.some((attachment) => attachment.status === 'invalid')) {
      return {
        kind: 'failed_attachment',
        reason: t('compose_card.footer.send_disabled.attachment_failed')
      };
    }
    if (isMicrosoftAccount && attachmentBytes > MICROSOFT_ATTACHMENT_BUDGET_BYTES) {
      return {
        kind: 'too_large',
        reason: t('compose_card.footer.send_disabled.too_large_microsoft', {
          limit: formatLimit(MICROSOFT_ATTACHMENT_BUDGET_BYTES)
        })
      };
    }
    if (composeKind === 'forward' && originalStatus === 'loading') {
      return {
        kind: 'forward_loading',
        reason: t('compose_card.footer.send_disabled.loading_original')
      };
    }
    return null;
  }, [
    composeDraft.from,
    composeDraft.to.length,
    sendingAccount,
    attachments,
    isMicrosoftAccount,
    attachmentBytes,
    composeKind,
    originalStatus,
    t
  ]);
  const sendBlockRef = useRef<SendBlock>(sendBlock);
  sendBlockRef.current = sendBlock;

  // Feedback for a send attempt that can't go: the reason, and the field to
  // fix when that's the recipients.
  const notifySendBlocked = useCallback(() => {
    const block = sendBlockRef.current;
    if (!block) return;
    if (block.kind === 'expired') {
      toast.error(t('toast.error.account_expired'), { id: 'compose-send-blocked' });
      return;
    }
    toast(block.reason, { id: 'compose-send-blocked' });
    if (block.kind === 'no_recipients') focusToInput();
  }, [focusToInput, t]);

  const handleSendMessage = useCallback(async () => {
    if (sendStartedRef.current || isSending) return;
    if (sendBlockRef.current) {
      notifySendBlocked();
      return;
    }

    let updatedDraft: MonoDraft;
    try {
      // Prepare the updated draft
      updatedDraft = new MonoDraft({
        ...composeDraft.toPlainObject(),
        threadId: isComposeDraftId(composeDraft.threadId) ? undefined : composeDraft.threadId,
        messageId: isComposeDraftId(composeDraft.threadId) ? undefined : composeDraft.messageId
      });

      // Default signature logic
      const signatureContent =
        signatures.find((signature) => signature.id === updatedDraft.signatureId)?.content ?? '';

      function optimizeForGmail(html) {
        // Add &nbsp; to empty paragraphs
        // This regex finds <p> tags with potentially attributes but no content
        const emptyParagraphRegex = /(<p[^>]*>)\s*(<\/p>)/g;
        return html.replace(emptyParagraphRegex, '$1&nbsp;$2');

        // Alternatively, to remove empty paragraphs:
        // return html.replace(emptyParagraphRegex, '');
      }

      // Ensure line breaks are preserved in the email body
      function preserveLineBreaks(html) {
        // Create a temporary DOM element to process the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Ensure <br> tags are preserved and not removed by CSS processing
        const brElements = tempDiv.querySelectorAll('br');
        brElements.forEach((br) => {
          // Add a data attribute to mark line breaks for preservation
          br.setAttribute('data-preserve-linebreak', 'true');
          // Ensure the br element has proper styling
          br.style.display = 'block';
          br.style.lineHeight = '1.5';
        });

        // Ensure <p> tags have proper spacing
        const pElements = tempDiv.querySelectorAll('p');
        pElements.forEach((p) => {
          // Add margin to paragraphs for proper spacing
          p.style.margin = '1em 0';
          p.style.lineHeight = '1.5';
        });

        return tempDiv.innerHTML;
      }

      // Ensure line breaks are preserved after CSS inlining
      function ensureLineBreaksAfterInlining(html) {
        // Create a temporary DOM element to process the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Find all <br> tags and ensure they are properly displayed
        const brElements = tempDiv.querySelectorAll('br');
        brElements.forEach((br) => {
          // Force the br element to be displayed as block
          br.style.setProperty('display', 'block', 'important');
          br.style.setProperty('line-height', '1.5', 'important');
          br.style.setProperty('margin', '0', 'important');
          br.style.setProperty('padding', '0', 'important');
          // Add a non-breaking space to ensure the line break is visible
          br.insertAdjacentHTML('afterend', '&#160;');
        });

        // Ensure paragraphs have proper spacing
        const pElements = tempDiv.querySelectorAll('p');
        pElements.forEach((p) => {
          p.style.setProperty('margin', '1em 0', 'important');
          p.style.setProperty('line-height', '1.5', 'important');
        });

        return tempDiv.innerHTML;
      }

      // This fix addresses the line break preservation issue where Shift+Enter line breaks
      // were not being preserved in sent emails. The issue was caused by the CSS inlining
      // process (juice.inlineContent) potentially affecting the HTML structure.
      // The solution involves:
      // 1. Pre-processing HTML to mark line breaks for preservation
      // 2. Post-processing after CSS inlining to ensure line breaks are properly displayed
      // 3. Adding CSS rules to force proper display of line breaks
      // Prepare the email body with signature and CSS
      const preservedBody = preserveLineBreaks(composeDraft.body);
      const cssParsedBody = juice.inlineContent(
        `<div class="reset-selection">${preservedBody}</div>`,
        `<style>${tailwindCSS}</style>`
      );
      const finalBody = ensureLineBreaksAfterInlining(cssParsedBody);
      const parsedHtml = `<html><body>${finalBody}<div id="mono-signature" class="my-2">${signatureContent}</div>${historyMessage ? formatForwardedMessage(historyMessage) : ''}</body></html>`;

      updatedDraft.update({
        body: optimizeForGmail(parsedHtml)
      });
    } catch (e) {
      console.error('Error preparing message:', e);
      toast.error(t('toast.error.send_mail'));
      return;
    }

    // Graph refuses an encoded MIME over its cap; say so now, with the reason,
    // instead of after the undo countdown with a generic error.
    if (isMicrosoftAccount) {
      const size = estimateMicrosoftRequestSize({
        attachmentBytes,
        ...measureHtmlBody(updatedDraft.body)
      });
      if (size > MICROSOFT_MAX_ENCODED_MIME) {
        toast.error(t('toast.error.message_too_large_microsoft'), { id: 'compose-send-blocked' });
        return;
      }
    }

    sendStartedRef.current = true;
    setIsSending(true);
    // Don't let a queued autosave re-add the draft after sendDraft removes it.
    debouncedUpdateDraft.cancel();

    try {
      // ...or one that's already writing.
      await inFlightSaveRef.current?.catch(() => undefined);
      await updateMessage(updatedDraft);
      // Send the draft
      const uid = getUidFromEmail(updatedDraft.from);
      if (uid) {
        await sendDraft(
          uid,
          updatedDraft,
          preference.compose.cancelWindow ?? 10,
          () => {
            updateMessage(composeDraft);
            executeCommand('COMPOSE_NEW_MESSAGE', { draft: composeDraft });
          },
          <span className="inline-flex items-end gap-1">
            {t('toast.undo')}{' '}
            <ShortcutKeyboard variant="text" className="gap-0 p-0" shortcut={'Z'} />
          </span>,
          trackingEnabled
        );

        handleClose();

        trackEvent('email_sent', {
          draft_id: composeDraft.id,
          thread_id: composeDraft.threadId,
          recipient_count: composeDraft.to.length,
          cc_count: composeDraft.cc.length,
          bcc_count: composeDraft.bcc.length,
          subject_length: composeDraft.subject.length,
          body_length: composeDraft.body.length,
          has_attachments: Object.keys(composeDraft.attachments).length > 0
        });
      } else {
        handleClose();
        updateMessage(composeDraft);
        executeCommand('COMPOSE_NEW_MESSAGE', { draft: composeDraft });
      }
    } catch (e) {
      sendStartedRef.current = false;
      updateMessage(composeDraft);
      setGlobalDraftWindows((drafts) => {
        const draftExists = drafts.some((draftWindow) => draftWindow.id === composeDraft.id);
        if (draftExists) {
          return drafts.map((draftWindow) =>
            draftWindow.id === composeDraft.id ? composeDraft : draftWindow
          );
        }
        return [...drafts, composeDraft];
      });
      console.error('Error:', e);
      toast.error(t('toast.error.send_mail'));
    } finally {
      setIsSending(false);
    }
  }, [
    isSending,
    composeDraft,
    preference.compose.cancelWindow,
    sendDraft,
    openDialog,
    trackingEnabled,
    debouncedUpdateDraft,
    notifySendBlocked,
    signatures,
    historyMessage,
    isMicrosoftAccount,
    attachmentBytes,
    getUidFromEmail,
    handleClose,
    t
  ]);

  // Scheduled from Send later: the queue owns the message now, so close
  // without the save prompt — an autosave or "Save" here would put the
  // draft back in Drafts and it could be sent twice.
  const handleScheduled = useCallback(() => {
    debouncedUpdateDraft.cancel();
    sendStartedRef.current = true;
    handleClose();
  }, [debouncedUpdateDraft, handleClose]);

  const isUntouched = useCallback(
    () => editableSnapshot(composeDraft) === openingSnapshot,
    [composeDraft, openingSnapshot]
  );

  const handleDiscard = useCallback(async () => {
    if (!composeDraft.from || !composeDraft.id) return;
    const uid = getUidFromEmail(composeDraft.from);
    const untouchedNewDraft = isUntouched() && !draftExistedAtOpenRef.current;
    handleClose();
    if (!uid) return;
    try {
      // Nothing worth an Undo in a compose that was opened and never typed in.
      if (untouchedNewDraft) await removeDraft(uid, composeDraft.id);
      else await discardDraftWithUndo(uid, composeDraft, { reopen: true });
    } catch (e) {
      console.error('Error discarding draft:', e);
    }
  }, [composeDraft, getUidFromEmail, handleClose, isUntouched, removeDraft, discardDraftWithUndo]);

  const handleCloseButton = useCallback(
    async (onComplete?: () => void) => {
      if (!composeDraft.from || !draft) {
        handleClose();
        onComplete?.();
        return;
      }

      if (!isUntouched()) {
        openDialog('saveDraft', {
          isNewDraft: !draftExistedAtOpenRef.current,
          onSave: async () => {
            handleClose();
            await updateMessage(composeDraft);
            onComplete?.();
          },
          onDiscard: async () => {
            handleClose();
            const uid = getUidFromEmail(draft.from);
            if (!draftExistedAtOpenRef.current && uid) {
              await removeDraft(uid, draft.id);
            } else {
              await updateMessage(openingDraft);
            }
            onComplete?.();
          }
        });
      } else {
        handleClose();
        // A default signature is applied (and saved) as compose opens; an
        // untouched new compose mustn't leave that empty draft in Drafts.
        const uid = getUidFromEmail(draft.from);
        if (!draftExistedAtOpenRef.current && uid) void removeDraft(uid, draft.id);
        onComplete?.();
      }
    },
    [
      composeDraft,
      draft,
      handleClose,
      openDialog,
      updateMessage,
      getUidFromEmail,
      removeDraft,
      isUntouched,
      openingDraft
    ]
  );

  // Other surfaces (a recipient chip's "New email", "Search for") close the
  // open compose through this — it was declared but never set, so they did
  // nothing. A stable wrapper: jotai would call a bare function as an updater.
  const handleCloseButtonRef = useRef(handleCloseButton);
  handleCloseButtonRef.current = handleCloseButton;
  useEffect(() => {
    const registered = (onComplete?: () => void) => handleCloseButtonRef.current(onComplete);
    setHandleCloseButton(() => registered);
    return () => {
      setHandleCloseButton((current) => (current === registered ? null : current));
    };
  }, [setHandleCloseButton]);

  // Replaced by another compose (C, R, F, Enter while this one is open or
  // minimized): save the last edits deliberately and say where they went.
  const latestRef = useRef({ composeDraft, debouncedUpdateDraft });
  latestRef.current = { composeDraft, debouncedUpdateDraft };
  const removeDraftRef = useRef(removeDraft);
  removeDraftRef.current = removeDraft;
  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;
  useEffect(
    () => () => {
      if (closedRef.current) return;
      const latest = latestRef.current;
      latest.debouncedUpdateDraft.flush();
      const windows = store.get(globalDraftWindowsAtom);
      const replaced =
        windows.length > 0 && !windows.some((win) => win.id === latest.composeDraft.id);
      if (!replaced) return;
      if (editableSnapshot(latest.composeDraft) === openingSnapshot) {
        const uid = getUidFromEmail(latest.composeDraft.from);
        if (!draftExistedAtOpenRef.current && uid) {
          void removeDraftRef.current(uid, latest.composeDraft.id);
        }
        return;
      }
      toast(t('toast.compose.draft_saved'), {
        action: {
          label: t('toast.compose.open_draft'),
          onClick: () =>
            void executeCommandRef.current('COMPOSE_NEW_MESSAGE', { draft: latest.composeDraft })
        }
      });
    },
    []
  );

  const onSignatureChange = useCallback(
    (signatureId: string | null) => {
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        if (signatureId) {
          updatedDraft.update({ signatureId: signatureId ?? undefined });
        } else {
          updatedDraft.removeSignatureId();
        }
        updateMessage(updatedDraft);
        return updatedDraft;
      });
    },
    [updateMessage]
  );

  // Attachments removed while their bytes were still being written, so the
  // finished write doesn't bring them back.
  const removedAttachmentIdsRef = useRef(new Set<string>());

  const onAttachmentChange = useCallback(
    async (attachmentId: string, file: File) => {
      const uid = getUidFromEmail(composeDraft.from);
      if (!uid) throw new Error(`No account for ${composeDraft.from}`);

      // Standalone: hold the bytes locally; buildRawMessage encodes them at send.
      await DBSaveAttachmentBlob(uid, {
        attachmentId,
        draftId: composeDraft.id,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        inline: false,
        blob: file
      });
      if (removedAttachmentIdsRef.current.has(attachmentId)) {
        void DBDeleteAttachmentBlob(uid, attachmentId);
        return;
      }

      // Merge into the latest draft: the copy from when the file was picked
      // reverted anything typed while a large file was being written.
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        updatedDraft.update({
          attachments: {
            ...prevDraft.attachments,
            [attachmentId]: {
              attachmentId,
              fileName: file.name,
              mimeType: file.type,
              size: file.size
            }
          }
        });
        debouncedUpdateDraft(updatedDraft);
        return updatedDraft;
      });
      trackEvent('email_attachment_uploaded', {
        draft_id: composeDraft.id,
        attachment_id: attachmentId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type
      });
    },
    [composeDraft.from, composeDraft.id, getUidFromEmail, debouncedUpdateDraft, trackEvent]
  );

  const onAttachmentDelete = useCallback(
    (attachmentId: string) => {
      const uid = getUidFromEmail(composeDraft.from);
      if (uid) void DBDeleteAttachmentBlob(uid, attachmentId);
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        const updatedAttachments = { ...updatedDraft.attachments };
        delete updatedAttachments[attachmentId];
        updatedDraft.update({ attachments: updatedAttachments });
        updateMessage(updatedDraft);
        return updatedDraft;
      });
    },
    [updateMessage, getUidFromEmail, composeDraft.from]
  );

  const renderDraftStatus = useMemo(() => {
    // Newton-styled status chips: mono uppercase tracked label paired
    // with a small status glyph so the composer state reads as a tiny
    // metadata stamp rather than a floating icon.
    const baseClass =
      'flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground';
    if (draftSaveStatus === 'LOADING' && showSavingStatus) {
      return (
        <span className={baseClass}>
          <Loader className="h-3 w-3" />
          {t('compose_card.status.saving')}
        </span>
      );
    }
    if (draftSaveStatus === 'ERROR') {
      return (
        <span className={cn(baseClass, 'text-destructive')}>
          <MonoIcon type={'AlertCircle'} className="h-3 w-3" />
          {t('compose_card.status.save_failed')}
        </span>
      );
    }
    return null;
  }, [draftSaveStatus, showSavingStatus, t]);

  const filesToUpload = useRef<Record<string, File>>({});
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const markAttachment = useCallback(
    (attachmentId: string, patch: Partial<MonoAttachmentWithStatus>) => {
      setAttachments((prev) =>
        // Removed meanwhile — don't bring a half-entry back.
        prev[attachmentId] ? { ...prev, [attachmentId]: { ...prev[attachmentId], ...patch } } : prev
      );
    },
    []
  );

  const uploadAttachment = useCallback(
    async (attachmentId: string, file: File) => {
      filesToUpload.current[attachmentId] = file;
      markAttachment(attachmentId, { status: 'loading', errorMessage: '' });
      try {
        await onAttachmentChange(attachmentId, file);
        markAttachment(attachmentId, { status: 'success', errorMessage: '' });
        delete filesToUpload.current[attachmentId];
      } catch (error) {
        console.error('Error attaching file:', error);
        toast.error(t('toast.error.attach_failed', { name: file.name }));
        // The File is kept in filesToUpload so Retry can try again.
        markAttachment(attachmentId, {
          status: 'invalid',
          errorMessage: t('compose_card.attachments.failed')
        });
      }
    },
    [markAttachment, onAttachmentChange, t]
  );

  const handleFileChange = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      if (!composeDraft.from) {
        toast.error(t('toast.error.no_email_to_save'));
        return;
      }

      // Size limits up front, against a running total so several files
      // picked at once can't all slip under a per-message budget.
      let total = Object.values(attachmentsRef.current)
        .filter((attachment) => attachment.status !== 'invalid')
        .reduce((sum, attachment) => sum + (attachment.size || 0), 0);
      const accepted: Array<{ id: string; file: File }> = [];
      for (const file of Array.from(fileList)) {
        if (isMicrosoftAccount) {
          if (total + file.size > MICROSOFT_ATTACHMENT_BUDGET_BYTES) {
            toast.error(
              t('toast.error.attachment_over_microsoft_limit', {
                name: file.name,
                limit: formatLimit(MICROSOFT_ATTACHMENT_BUDGET_BYTES)
              })
            );
            continue;
          }
        } else if (file.size > GMAIL_MAX_FILE_BYTES) {
          toast.error(
            t('toast.error.file_too_large_named', {
              name: file.name,
              limit: formatLimit(GMAIL_MAX_FILE_BYTES)
            })
          );
          continue;
        }
        total += file.size;
        accepted.push({ id: generateUUID(), file });
      }
      if (accepted.length === 0) return;

      // Show the files as attaching right away (Send waits for them).
      setAttachments((prev) => {
        const next = { ...prev };
        accepted.forEach(({ id, file }) => {
          next[id] = {
            attachmentId: id,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'loading',
            errorMessage: ''
          };
        });
        return next;
      });

      if (draftSaveStatus === 'INITIALIZED') {
        try {
          const uid = getUidFromEmail(composeDraft.from);
          if (uid) {
            await updateDraft(uid, composeDraft, true, true);
          }
        } catch (error) {
          handleDraftSaveError(error);
          accepted.forEach(({ id, file }) => {
            filesToUpload.current[id] = file;
            markAttachment(id, {
              status: 'invalid',
              errorMessage: t('compose_card.attachments.failed')
            });
          });
          return;
        }
      }

      await Promise.allSettled(accepted.map(({ id, file }) => uploadAttachment(id, file)));
    },
    [
      composeDraft,
      draftSaveStatus,
      getUidFromEmail,
      handleDraftSaveError,
      isMicrosoftAccount,
      markAttachment,
      t,
      updateDraft,
      uploadAttachment
    ]
  );

  const retryAttachment = useCallback(
    (attachmentId: string) => {
      const file = filesToUpload.current[attachmentId];
      if (file) void uploadAttachment(attachmentId, file);
    },
    [uploadAttachment]
  );

  // Handler for single file attachment from drag and drop
  const handleAttachmentUpload = useCallback(
    async (file: File) => {
      // Create a FileList-like object with a single file
      await handleFileChange(filesToFileList([file]));
    },
    [handleFileChange]
  );

  const isInlineEditorDropEvent = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return false;

    const editorElement = event.target.closest('.ProseMirror') as HTMLElement | null;
    if (!editorElement) return false;

    if (event.target !== editorElement) return true;

    const contentBottom = Array.from(editorElement.children).reduce((bottom, child) => {
      return Math.max(bottom, child.getBoundingClientRect().bottom);
    }, editorElement.getBoundingClientRect().top);

    return event.clientY <= contentBottom + 12;
  }, []);

  const hasDraggedFiles = useCallback((event: React.DragEvent<HTMLElement>) => {
    return (
      event.dataTransfer.files.length > 0 ||
      Array.from(event.dataTransfer.items).some((item) => item.kind === 'file') ||
      Array.from(event.dataTransfer.types).includes('Files')
    );
  }, []);

  const handleAttachmentDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event) || isInlineEditorDropEvent(event)) return;

      event.preventDefault();
      event.stopPropagation();
      setIsAttachmentDropActive(true);
    },
    [hasDraggedFiles, isInlineEditorDropEvent]
  );

  const handleAttachmentDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event)) return;

      if (isInlineEditorDropEvent(event)) {
        setIsAttachmentDropActive(false);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setIsAttachmentDropActive(true);
    },
    [hasDraggedFiles, isInlineEditorDropEvent]
  );

  const handleAttachmentDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event) || isInlineEditorDropEvent(event)) return;

      const currentTarget = event.currentTarget;
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return;

      setIsAttachmentDropActive(false);
    },
    [hasDraggedFiles, isInlineEditorDropEvent]
  );

  const handleAttachmentDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event) || isInlineEditorDropEvent(event)) return;

      event.preventDefault();
      event.stopPropagation();
      setIsAttachmentDropActive(false);

      const droppedFiles = getDraggedFiles(event.dataTransfer);
      if (droppedFiles.length === 0) return;

      await handleFileChange(filesToFileList(droppedFiles));
    },
    [handleFileChange, hasDraggedFiles, isInlineEditorDropEvent]
  );

  // Handle file delete
  const handleFileDelete = useCallback(
    async (attachmentId: string) => {
      removedAttachmentIdsRef.current.add(attachmentId);
      setAttachments((prev) => {
        const updated = { ...prev };
        delete updated[attachmentId];
        return updated;
      });

      delete filesToUpload.current[attachmentId];
      onAttachmentDelete(attachmentId);
    },
    [onAttachmentDelete]
  );

  // Only while compose is up: minimized, focus can sit on a list row and
  // Cmd+Enter sent a draft the user couldn't see.
  useHotkeys(
    'MOD+ENTER',
    handleSendMessage,
    {
      preventDefault: true,
      enabled: !isMinimized && !isClosing
    },
    [handleSendMessage]
  );
  useHotkeys('MOD+SHIFT+M', toggleMinimize, { preventDefault: true, scopes: ['GLOBAL_COMPOSE'] }, [
    toggleMinimize
  ]);

  // Cc/Bcc rows: shown on request, or whenever they already hold recipients.
  const ccVisible = showCc || composeDraft.cc.length > 0;
  const bccVisible = showBcc || composeDraft.bcc.length > 0;
  // Asked-for focus for a row that's about to appear.
  const [focusRowRequest, setFocusRowRequest] = useState<{ row: 'cc' | 'bcc' } | null>(null);
  const toggleRecipientRow = useCallback(
    (row: 'cc' | 'bcc') => {
      const visible = row === 'cc' ? ccVisible : bccVisible;
      const hasRecipients = (row === 'cc' ? composeDraft.cc : composeDraft.bcc).length > 0;
      const setShow = row === 'cc' ? setShowCc : setShowBcc;
      // A row with recipients can't hide; the toggle takes you to it instead.
      if (visible && !hasRecipients) {
        setShow(false);
        return;
      }
      setShow(true);
      setFocusRowRequest({ row });
    },
    [ccVisible, bccVisible, composeDraft.cc, composeDraft.bcc]
  );
  useEffect(() => {
    if (!focusRowRequest) return;
    composeRootRef.current
      ?.querySelector<HTMLInputElement>(`[data-compose-${focusRowRequest.row}] input`)
      ?.focus();
    setFocusRowRequest(null);
  }, [focusRowRequest, ccVisible, bccVisible]);

  // Shortcuts shared by the recipient fields and Subject.
  const handleComposeFieldShortcut = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!hasModKey(event) || !event.shiftKey) return false;
      if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMinimize();
        return true;
      }
      if (event.code === 'KeyC' || event.code === 'KeyB') {
        event.preventDefault();
        toggleRecipientRow(event.code === 'KeyC' ? 'cc' : 'bcc');
        return true;
      }
      return false;
    },
    [toggleMinimize, toggleRecipientRow]
  );

  const memoizedAttachments = useMemo(() => {
    const uid = getUidFromEmail(composeDraft.from);
    const attachmentEntries = Object.entries(attachments);
    // Nothing to list → no tray; while dragging, the overlay alone says
    // "drop here" (the tray used to pop in under the pointer).
    if (!uid || attachmentEntries.length === 0) return null;

    return (
      <div className="mx-9 shrink-0 border-t border-border py-2.5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <MonoIcon type="Paperclip" className="h-3.5 w-3.5" />
          <span>{t('compose_card.attachments.title')}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
            {t('compose_card.attachments.count', { count: attachmentEntries.length })}
          </span>
        </div>
        <div className="max-h-[112px] overflow-y-auto pr-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {attachmentEntries.map(([id, attachment]) => {
              const isReady = attachment.status === 'success';
              const isInvalid = attachment.status === 'invalid';

              return (
                <div
                  key={attachment.attachmentId}
                  className={cn(
                    'group flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/25 px-2.5 py-2 transition-colors',
                    isReady && 'hover:border-border hover:bg-muted/40',
                    isInvalid && 'border-destructive/40 bg-destructive/5'
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-100"
                    disabled={!isReady}
                    aria-label={t('compose_card.attachments.preview', {
                      name: attachment.fileName
                    })}
                    onClick={() => {
                      openDialog('attachmentPreview', {
                        accountId: uid,
                        source: 'draft',
                        itemId: composeDraft.id,
                        attachment
                      });
                    }}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground',
                        isInvalid && 'text-destructive'
                      )}
                      aria-hidden
                    >
                      {attachment.status === 'loading' ? (
                        <Loader className="h-3.5 w-3.5" />
                      ) : (
                        getAttachmentIcon(attachment.mimeType, 'h-4 w-4')
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium tracking-tight text-foreground">
                        {attachment.fileName}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block truncate font-mono text-[10px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground',
                          isInvalid && 'text-destructive'
                        )}
                      >
                        {attachment.status === 'loading'
                          ? t('compose_card.attachments.attaching')
                          : isInvalid
                            ? attachment.errorMessage || t('compose_card.attachments.failed')
                            : formatAttachmentSize(attachment.size)}
                      </span>
                    </span>
                  </button>

                  {isInvalid && filesToUpload.current[id] && (
                    <Button
                      className="h-7 shrink-0 px-2 text-[12px] text-muted-foreground hover:text-foreground"
                      variant={'ghost'}
                      sizeVariant={'xs'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        retryAttachment(id);
                      }}
                    >
                      {t('compose_card.attachments.retry')}
                    </Button>
                  )}

                  <Button
                    className="-mr-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    type="button"
                    variant={'ghost'}
                    sizeVariant={'xs'}
                    typeVariant={'icon'}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFileDelete(id);
                    }}
                    tooltip={t('compose_card.attachments.remove')}
                  >
                    <MonoIcon type={'X'} className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [
    attachments,
    composeDraft.from,
    composeDraft.id,
    getUidFromEmail,
    handleFileDelete,
    openDialog,
    retryAttachment,
    t
  ]);

  // Optimize render method for editor section
  const renderEditor = useMemo(() => {
    if (!isEditorMounted) {
      return <EditorLoadingFallback />;
    }

    return (
      <Suspense fallback={<EditorLoadingFallback />}>
        <TextEditor
          ref={editorRef}
          autofocus={editorAutofocus}
          className="min-h-[210px] px-9 py-4 text-[14px]"
          value={composeDraft.body}
          onChange={handleInputChange.bind(null, 'body')}
          onUploadInlineImage={handleUploadInlineImage}
          onUploadAttachment={handleAttachmentUpload}
          draftId={composeDraft.id}
          onEditorKeyDown={(view, event) => {
            const { state } = view;
            const { from, to } = state.selection;

            // Backspace in an empty body steps back to Subject — once per
            // press: holding Backspace to clear the body used to carry on
            // and erase the subject too.
            if (event.key === 'Backspace') {
              if (from === 1 && to === 1 && !event.repeat && state.doc.textContent.length === 0) {
                event.preventDefault();
                subjectRef.current?.focus();
                return true;
              }
              return false;
            }

            if (hasModKey(event) && event.shiftKey && event.code === 'KeyM') {
              event.preventDefault();
              toggleMinimize();
              return true;
            }
            if (hasModKey(event) && event.key === 'Enter') {
              event.preventDefault();
              handleSendMessage();
              return true;
            }

            // Handle Cmd+Shift+V for plain text paste
            if (hasModKey(event) && event.shiftKey && event.code === 'KeyV') {
              event.preventDefault();

              // Try to get plain text from clipboard
              if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard
                  .readText()
                  .then((text) => {
                    if (text) {
                      // Insert plain text at current selection without any formatting
                      insertPlainText(view, text);
                    }
                  })
                  .catch((error) => {
                    console.error('Failed to read clipboard text:', error);
                    // Fallback: show a message to the user
                    toast.error(t('toast.error.clipboard_read'));
                  });
              } else {
                // Fallback for browsers that don't support Clipboard API
                toast.error(t('toast.error.plain_paste_unsupported'));
              }

              return true;
            }

            return false;
          }}
        />
      </Suspense>
    );
  }, [
    isEditorMounted,
    composeDraft.body,
    composeDraft.id,
    handleInputChange,
    handleUploadInlineImage,
    toggleMinimize,
    handleSendMessage,
    editorAutofocus,
    t
  ]);

  const accountId = getUidFromEmail(composeDraft.from) as string;
  const title =
    composeKind === 'forward'
      ? t('compose_card.title.forward')
      : composeKind === 'reply'
        ? t('compose_card.title.reply')
        : t('compose_card.title.new');

  return (
    <div
      ref={composeRootRef}
      tabIndex={-1}
      // Read by useRegisterHotkeys to mute plain-key app shortcuts while open.
      data-compose-expanded={!isMinimized && !isClosing}
      className={cn(
        'absolute inset-0 z-40 origin-bottom transition-all duration-300',
        isMinimized
          ? 'pointer-events-none flex items-end justify-center px-6 pb-6'
          : 'pointer-events-auto flex flex-col bg-background',
        // The full-window backdrop fades with the card instead of cutting in
        // and out.
        (!isVisible || isClosing) && 'opacity-0'
      )}
    >
      {!isMinimized && (
        <div
          className={cn(
            'grid h-[72px] shrink-0 items-center px-8',
            // The title column follows the card's width.
            isMaximized
              ? 'grid-cols-[1fr_minmax(0,960px)_1fr]'
              : 'grid-cols-[1fr_minmax(0,768px)_1fr]'
          )}
        >
          <div className="flex justify-end pr-2">
            <Button
              variant="ghost"
              sizeVariant="sm"
              typeVariant="icon"
              className="pointer-events-auto h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => void handleCloseButton()}
              tooltip={t('tooltip.back')}
            >
              <MonoIcon type="ChevronLeft" className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex min-w-0 items-center">
            <h1 className="truncate text-[24px] font-medium tracking-normal text-foreground">
              {title}
            </h1>
          </div>
          <div />
        </div>
      )}
      <div
        className={cn(
          'pointer-events-none flex min-h-0 flex-1 justify-center px-8',
          isMinimized ? 'contents' : isMaximized ? 'items-stretch pb-8' : 'items-start pb-8'
        )}
      >
        <Card
          className={cn(
            'pointer-events-auto flex flex-col border border-foreground/[0.06] bg-card ease-bouncy-in-out dark:border-white/[0.06]',
            'w-full min-w-0 transition-all duration-300',
            isMaximized
              ? 'h-full min-h-0 max-w-[960px]'
              : 'h-full max-h-[720px] min-h-[405px] max-w-[768px]',
            isMinimized
              ? 'max-h-12 min-h-12 min-w-80 max-w-80 rounded-xl shadow-md'
              : 'rounded-md shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_10px_28px_-14px_hsl(var(--foreground)/0.14)] dark:shadow-none',

            // isClosing ? 'duration-0' : 'duration-400',
            // isVisible && !isClosing ? '' : 'h-0 max-h-0 min-h-0',
            isVisible && !isClosing ? '' : 'translate-y-4 opacity-0',
            className
          )}
          style={{
            willChange: 'width, height, max-height, max-width'
          }}
        >
          <CardHeader className={cn('justify-center space-y-0 p-0')}>
            <ComposeCardHeader
              composeDraft={composeDraft}
              handleInputChange={handleInputChange}
              onKeyDown={(event) => {
                // Tab order follows the visible fields via natural DOM order
                // (To → Cc/Bcc when shown → Subject); the Cc/Bcc toggles and
                // window buttons are tabIndex={-1} so Tab skips them.
                if (handleComposeFieldShortcut(event)) return;
                if (hasModKey(event) && event.key === 'Enter') {
                  // Text typed but not yet a chip isn't in the draft: let the
                  // field take this Enter (picks the suggestion), then send.
                  const input = event.target instanceof HTMLInputElement ? event.target : null;
                  if (input && input.value.trim()) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSendMessage();
                }
              }}
              onClose={handleCloseButton}
              onMinimize={toggleMinimize}
              onMaximize={toggleMaximize}
              isMinimized={isMinimized}
              isMaximized={isMaximized}
              ccVisible={ccVisible}
              bccVisible={bccVisible}
              onToggleCc={() => toggleRecipientRow('cc')}
              onToggleBcc={() => toggleRecipientRow('bcc')}
            />
          </CardHeader>
          {/* Kept mounted while minimized (hidden, so nothing inside can be
              tabbed to): unmounting threw away the caret, undo history and
              scroll position. */}
          <CardContent
            className={cn(
              'no-drag relative min-h-0 flex-1 overflow-hidden p-0',
              isMinimized && 'hidden'
            )}
            onDragEnterCapture={handleAttachmentDragEnter}
            onDragOverCapture={handleAttachmentDragOver}
            onDragLeaveCapture={handleAttachmentDragLeave}
            onDropCapture={handleAttachmentDrop}
          >
            {isAttachmentDropActive && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-md border border-chart-1/40 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm">
                  <MonoIcon type="Paperclip" className="h-4 w-4 text-chart-1" />
                  <span>{t('compose_card.drop_file')}</span>
                </div>
              </div>
            )}
            <div className="flex h-full min-h-0 flex-col">
              <div className="px-9 pb-1 pt-3">
                <Input
                  ref={subjectRef}
                  variant="transparent"
                  placeholder={t('text_editor.placeholder.subject')}
                  className="h-auto border-none px-0 py-0 text-[14px] font-semibold tracking-normal text-foreground placeholder:text-muted-foreground/80"
                  value={composeDraft.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  onKeyDown={(event) => {
                    if (handleComposeFieldShortcut(event)) return;
                    if (hasModKey(event) && event.key === 'Enter') {
                      event.preventDefault();
                      handleSendMessage();
                      return;
                    }
                    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
                      event.preventDefault();
                      editorRef.current?.focus();
                    }
                  }}
                />
              </div>
              <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
                {renderEditor}
                <div className="px-9 text-sm">
                  <SignatureSwitcher draft={composeDraft} onSignatureChange={onSignatureChange} />
                </div>

                {historyMessage && (
                  <div className="mt-4 px-9 text-sm">
                    <ReferenceCard accountId={accountId} type={'forward'} item={historyMessage} />
                  </div>
                )}
                {replyMessage && (
                  <div className="mt-4 px-9 text-sm">
                    <ReferenceCard accountId={accountId} type={'reply'} item={replyMessage} />
                  </div>
                )}
                {composeKind === 'forward' && originalStatus === 'failed' && (
                  <div className="mt-4 px-9 text-sm">
                    <div className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-[13px] text-muted-foreground">
                      <MonoIcon type="AlertCircle" className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">{t('compose_card.original_failed')}</span>
                      <Button
                        variant="ghost"
                        sizeVariant="xs"
                        onClick={() => setOriginalAttempt((attempt) => attempt + 1)}
                      >
                        {t('compose_card.attachments.retry')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {memoizedAttachments}
            </div>
          </CardContent>
          <div
            className={cn(
              'transition-colors',
              isAttachmentDropActive && 'bg-chart-1/5',
              isMinimized && 'hidden'
            )}
            onDragEnterCapture={handleAttachmentDragEnter}
            onDragOverCapture={handleAttachmentDragOver}
            onDragLeaveCapture={handleAttachmentDragLeave}
            onDropCapture={handleAttachmentDrop}
          >
            <ComposeCardFooter
              draft={composeDraft}
              draftStatus={renderDraftStatus}
              handleSendMessage={handleSendMessage}
              handleFileChange={handleFileChange}
              sendBlockedReason={sendBlock?.reason ?? null}
              onSendBlocked={notifySendBlocked}
              onScheduled={handleScheduled}
              onDiscard={handleDiscard}
              trackingEnabled={trackingEnabled}
              onToggleTracking={handleToggleTracking}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default GlobalComposeCard;
