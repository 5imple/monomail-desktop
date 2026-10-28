import { apiClient } from '@/main/api/apiClient';
import { IMonoTemplate } from '@/main/api/template/types';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoAttachment } from '@/main/models/types';
import { generateUUID } from '@/main/utils';
import ComposeCardFooter from '@/renderer/app/components/card/compose/ComposeCardFooter';
import ComposeCardHeader, {
  ReplyAllToggle
} from '@/renderer/app/components/card/compose/ComposeCardHeader';
import {
  closeOutcome,
  editableSnapshot,
  escapeClosesCompose,
  findUnfilledVariables,
  toggleReplyAll
} from '@/renderer/app/components/card/compose/composeLifecycle';
import { defaultSignatureId } from '@/renderer/app/components/card/compose/defaultSignature';
import { loadReplyOriginal } from '@/renderer/app/components/card/compose/loadReplyOriginal';
import { useSendComposedDraft } from '@/renderer/app/components/card/compose/useSendComposedDraft';
import { prewarmEmailInliner } from '@/renderer/app/components/card/compose/prepareOutgoingDraft';
import ReferenceCard from '@/renderer/app/components/card/compose/ReferenceCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import SignatureSwitcher from '@/renderer/app/components/mail/SignatureSwitcher';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import { Input } from '@/renderer/app/components/ui/input';
import Loader from '@/renderer/app/components/ui/loader';
import TextEditor, { TextEditorHandle } from '@/renderer/app/containers/editor/TextEditor';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useDiscardDraftWithUndo } from '@/renderer/app/hooks/useDiscardDraftWithUndo';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { DBGetDraftById } from '@/renderer/app/lib/db/draft';
import {
  DBDeleteAttachmentBlob,
  DBSaveAttachmentBlob
} from '@/renderer/app/lib/db/draftAttachment';
import { getAttachmentIcon } from '@/renderer/app/lib/getAttachmentIcon';
import { hasModKey } from '@/renderer/app/lib/platform';
import { buildReplyAllRecipients } from '@/renderer/app/lib/replyRecipients';
import {
  GMAIL_MAX_FILE_BYTES,
  MICROSOFT_ATTACHMENT_BUDGET_BYTES,
  formatLimit
} from '@/renderer/app/lib/sendSizeLimits';
import { insertPlainText } from '@/renderer/app/lib/text-editor/PlainTextPasteExtension';
import { cn } from '@/renderer/app/lib/utils';
import {
  globalDraftWindowsAtom,
  useComposeWindowAtom
} from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useStore } from 'jotai';
import { debounce } from 'lodash';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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

// Autosave: a second after typing pauses, and at least every five seconds
// while it doesn't (a long reply typed without a pause was never saved).
const AUTOSAVE_DELAY_MS = 1000;
const AUTOSAVE_MAX_WAIT_MS = 5000;
// Open / close fade (opacity + transform, duration-150). The window is removed
// when the fade ends; this is the backstop if no transition runs.
const CLOSE_FALLBACK_MS = 200;

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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A new message gets a full page to write on; replies and forwards (mostly a
// few lines) start shorter. Both grow with the text.
const EDITOR_MIN_HEIGHT: Record<ComposeKind, string> = {
  new: 'min-h-[210px]',
  reply: 'min-h-[150px]',
  forward: 'min-h-[150px]'
};

const GlobalComposeCard: React.FC<GlobalComposeCardProps> = ({ className, draft }) => {
  const { preference, getUidFromEmail, accounts, updatePreference } = useAuth();
  const { t } = useTranslation();
  const executeCommand = useExecuteCommand();
  const { getDefaultSignature } = useSignatureAtom();
  const { openDialog } = useDialogs();
  const { updateDraft, removeDraft } = useDraftAtom();
  const discardDraftWithUndo = useDiscardDraftWithUndo();
  const { setGlobalDraftWindows, setHandleCloseButton } = useComposeWindowAtom();
  const store = useStore();
  const sendComposed = useSendComposedDraft();
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isMinimized, setIsMinimized] = useState(false);
  // Settings › Compose › Fullscreen Compose opens every compose expanded.
  const [isMaximized, setIsMaximized] = useState(() => preference.compose?.fullscreen ?? false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { trackEvent } = useUserTrackingData();
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

    // The default signature is chosen here, not saved: applying it through a
    // full draft save on open wrote (and re-rendered the thread for) every
    // compose, and an untouched one then had to be deleted again on close.
    if (!initialDraft.signatureId) {
      const signatureId = defaultSignatureId(
        initialDraft,
        preference.signature,
        getUidFromEmail,
        getDefaultSignature
      );
      if (signatureId) initialDraft.signatureId = signatureId;
    }

    return initialDraft;
  });
  const composeDraftRef = useRef(composeDraft);
  composeDraftRef.current = composeDraft;
  // The draft as it opened, for "nothing changed" checks.
  const [openingSnapshot] = useState(() => editableSnapshot(composeDraft));
  // A signature picked by the user (the snapshot leaves the signature out).
  const signaturePickedRef = useRef(false);
  const isUntouched = useCallback(
    (latest: MonoDraft) =>
      !signaturePickedRef.current && editableSnapshot(latest) === openingSnapshot,
    [openingSnapshot]
  );
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
  const [hasSaved, setHasSaved] = useState(false);
  const editorMinHeightClass = EDITOR_MIN_HEIGHT[composeKind];

  const subjectRef = useRef<HTMLInputElement>(null);
  const composeRootRef = useRef<HTMLDivElement>(null);
  // Where focus was inside compose when it was minimized, to return there.
  const focusBeforeMinimizeRef = useRef<Element | null>(null);
  // What had focus when compose opened, to hand focus back on close.
  const openerRef = useRef<Element | null>(
    typeof document !== 'undefined' ? document.activeElement : null
  );

  // ── The body ─────────────────────────────────────────────────────────────
  // The editor owns the text; it isn't React state. Copying it into the draft
  // on every keystroke re-rendered the whole card (recipient fields, footer,
  // quoted message) per key. Edits mark it dirty and schedule the autosave;
  // the HTML is read when it's needed (save, send, close).
  const editorRef = useRef<TextEditorHandle | null>(null);
  // The handle, kept after unmount (React clears editorRef first), so the
  // replaced-compose cleanup can still read the last keystrokes.
  const editorHandleRef = useRef<TextEditorHandle | null>(null);
  const setEditorHandle = useCallback((handle: TextEditorHandle | null) => {
    editorRef.current = handle;
    if (handle) editorHandleRef.current = handle;
  }, []);
  const [initialBody] = useState(() => composeDraft.body ?? '');
  const bodyRef = useRef(initialBody);
  const bodyDirtyRef = useRef(false);
  const bodyEditedAtRef = useRef(0);
  const readBody = useCallback(() => {
    if (bodyDirtyRef.current) {
      const html = editorHandleRef.current?.getHTML();
      if (typeof html === 'string') {
        bodyRef.current = html;
        bodyDirtyRef.current = false;
      }
    }
    return bodyRef.current;
  }, []);
  // `base` with the editor's current text.
  const withLiveBody = useCallback(
    (base: MonoDraft) => {
      const next = new MonoDraft(base.toPlainObject());
      next.body = readBody();
      if (bodyEditedAtRef.current > next.timestamp) next.timestamp = bodyEditedAtRef.current;
      return next;
    },
    [readBody]
  );
  // The draft as it is now: its fields plus the editor's latest text.
  const currentDraft = useCallback(() => withLiveBody(composeDraftRef.current), [withLiveBody]);

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

  // The save currently writing to the store. Send and close wait for it, so
  // an autosave finishing late can't overwrite newer text or put a sent /
  // discarded draft back in Drafts.
  const inFlightSaveRef = useRef<Promise<unknown> | null>(null);
  const trackSave = useCallback(<T,>(save: Promise<T>): Promise<T> => {
    inFlightSaveRef.current = save;
    const clear = () => {
      if (inFlightSaveRef.current === save) inFlightSaveRef.current = null;
    };
    save.then(clear, clear);
    return save;
  }, []);

  // Writes `toSave` (already holding the text to keep). True when it saved.
  const saveDraftNow = useCallback(
    async (toSave: MonoDraft, options?: { track?: boolean }): Promise<boolean> => {
      const uid = getUidFromEmail(toSave.from);
      if (!toSave.from || !uid) return false;
      apiClient.setApiActiveUid(uid);
      try {
        setDraftSaveStatus('LOADING');
        await trackSave(updateDraft(uid, toSave, true, true));
        setDraftSaveStatus('SAVED');
        setHasSaved(true);
        // Counted for deliberate saves (closing with edits), as before — not
        // for every autosave.
        if (options?.track) {
          trackEvent('email_draft_saved', {
            draft_id: toSave.id,
            thread_id: toSave.threadId,
            has_attachments: Object.keys(toSave.attachments).length > 0,
            subject_length: toSave.subject.length,
            body_length: toSave.body.length
          });
        }
        return true;
      } catch (error) {
        handleDraftSaveError(error);
        setDraftSaveStatus('ERROR');
        return false;
      }
    },
    [getUidFromEmail, trackSave, updateDraft, trackEvent, handleDraftSaveError]
  );
  const saveDraftNowRef = useRef(saveDraftNow);
  saveDraftNowRef.current = saveDraftNow;

  // Set once the window starts closing (send, discard, close, schedule), so the
  // unmount cleanup knows it wasn't replaced by another compose.
  const closedRef = useRef(false);

  // One autosave for the life of the window; it reads the latest draft when
  // it runs, so callers just say "something changed".
  const autosaveRef = useRef<() => void>(() => undefined);
  autosaveRef.current = () => {
    if (closedRef.current) return;
    void saveDraftNow(currentDraft());
  };
  const debouncedUpdateDraft = useMemo(
    () =>
      debounce(() => autosaveRef.current(), AUTOSAVE_DELAY_MS, {
        maxWait: AUTOSAVE_MAX_WAIT_MS
      }),
    []
  );

  // Leaving the app (window hidden, reload) saves what's pending. Best effort:
  // the IndexedDB write can't be awaited here.
  useEffect(() => {
    const flush = () => debouncedUpdateDraft.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [debouncedUpdateDraft]);

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

  // Whether this draft was saved before the window opened, from IndexedDB
  // (the in-memory drafts map was empty after a restart, so every saved draft
  // looked new and closing it untouched deleted it). null until the lookup
  // answers; every delete path treats null as "saved". Nothing is written on
  // open any more, so the lookup sees the draft as it was.
  const draftExistedAtOpenRef = useRef<boolean | null>(null);
  const existenceLookupStartedRef = useRef(false);
  if (!existenceLookupStartedRef.current) {
    existenceLookupStartedRef.current = true;
    const uid = composeDraft.from ? getUidFromEmail(composeDraft.from) : undefined;
    if (uid && composeDraft.id) {
      DBGetDraftById(uid, composeDraft.id).then(
        (saved) => {
          draftExistedAtOpenRef.current = !!saved;
        },
        (error) => console.error('[compose] could not look up the saved draft:', error)
      );
    }
  }

  const finishedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishClose = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setGlobalDraftWindows((prev) => prev.filter((win) => win.id !== draft?.id));
  }, [draft, setGlobalDraftWindows]);

  const handleClose = useCallback(() => {
    // A pending autosave firing after close resurrected a just-discarded
    // draft (or kept edits the user chose not to save).
    debouncedUpdateDraft.cancel();
    if (closedRef.current) return;
    closedRef.current = true;
    setIsClosing(true);
    // Focus goes back now, not after the fade: to whatever opened compose
    // (the list or reader) if it's still on screen — never click or select
    // it. Otherwise out of the fading card, so keys don't type into it.
    const root = composeRootRef.current;
    const opener = openerRef.current;
    if (
      opener instanceof HTMLElement &&
      opener !== document.body &&
      opener.isConnected &&
      !root?.contains(opener)
    ) {
      opener.focus({ preventScroll: true });
    } else if (root && document.activeElement instanceof HTMLElement) {
      if (root.contains(document.activeElement)) document.activeElement.blur();
    }
    // Removed when the fade ends (onTransitionEnd); this is the backstop.
    closeTimerRef.current = setTimeout(finishClose, prefersReducedMotion() ? 0 : CLOSE_FALLBACK_MS);
  }, [debouncedUpdateDraft, finishClose]);

  // A new message / forward with no recipients yet should start in To, not
  // the body.
  const [focusToOnOpen] = useState(() => (draft?.to?.length ?? 0) === 0);
  // Reopening a draft puts the caret after what's already written.
  const [editorFocusAt] = useState<'start' | 'end'>(() =>
    (draft?.body ?? '').replace(/<p><\/p>/g, '').trim() ? 'end' : 'start'
  );

  const focusToInput = useCallback(() => {
    composeRootRef.current?.querySelector<HTMLInputElement>('[data-compose-to] input')?.focus();
  }, []);

  // First focus, in the same commit that shows the card: the editor exists
  // as soon as it renders, so the next key typed lands in it (it used to
  // mount 100 ms later behind a timer and a lazy chunk, and keys typed
  // meanwhile were lost).
  useLayoutEffect(() => {
    const focusInitialField = (): boolean => {
      if (closedRef.current) return true;
      if (focusToOnOpen) {
        const toInput =
          composeRootRef.current?.querySelector<HTMLInputElement>('[data-compose-to] input');
        if (toInput) {
          toInput.focus();
          return true;
        }
      }
      if (editorRef.current) {
        editorRef.current.focus(editorFocusAt);
        return true;
      }
      return false;
    };
    if (focusInitialField()) return;
    // Not in the page yet (shouldn't happen): one more try next frame.
    const frame = requestAnimationFrame(() => void focusInitialField());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setIsVisible(true); // Fade / slide in
    activateScope('GLOBAL_COMPOSE');
    // juice + the stylesheet for Send, loaded while the user writes.
    prewarmEmailInliner();
    return () => {
      deactivateScope('GLOBAL_COMPOSE');
    };
  }, []);

  const handleInputChange = useCallback(
    (field: keyof MonoDraft, value: string | string[]) => {
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        updatedDraft.update({ [field]: value });
        return updatedDraft;
      });
      debouncedUpdateDraft();
    },
    [debouncedUpdateDraft]
  );

  // Every edit in the body: cheap — no serialising, no re-render.
  const handleBodyDirty = useCallback(() => {
    bodyDirtyRef.current = true;
    bodyEditedAtRef.current = Date.now();
    debouncedUpdateDraft();
  }, [debouncedUpdateDraft]);

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

  // Synchronous once-per-card send guard. A double-click / Cmd+Enter-then-click
  // burst must not schedule a second countdown (Undo would cancel only one).
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
        // In full and parsed once, for the quoted card and the send.
        const original = await loadReplyOriginal(uid, messageId);
        if (!mountedRef.current) return;

        loadedOriginalIdRef.current = messageId;
        if (composeKind === 'forward') setHistoryMessages(original);
        else setReplyMessages(original);
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
    // The original goes under a reply (quoted) or a forward: wait for it.
    if (composeKind !== 'new' && originalStatus === 'loading') {
      return {
        kind: 'forward_loading',
        reason:
          composeKind === 'reply'
            ? t('compose_card.footer.send_disabled.loading_reply')
            : t('compose_card.footer.send_disabled.loading_original')
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

  const handleSendRef = useRef<(options?: { allowUnfilled?: boolean }) => Promise<void>>(
    async () => undefined
  );

  // Send closes the card at once; the undo countdown toast is the feedback.
  // Preparing the outgoing message (CSS inlining, quoted pictures, the size
  // check) happens during the countdown, and only the draft as written is
  // saved first — that's what Undo and a failed send bring back.
  const handleSendMessage = useCallback(
    async (options?: { allowUnfilled?: boolean }) => {
      if (sendStartedRef.current || closedRef.current) return;
      if (sendBlockRef.current) {
        notifySendBlocked();
        return;
      }
      // Template merge fields left as {first_name}: ask before they go out.
      if (!options?.allowUnfilled) {
        const unfilled = findUnfilledVariables(editorHandleRef.current?.getText() ?? '');
        if (unfilled.length > 0) {
          toast(t('compose_card.unfilled_variables', { names: unfilled.join(', ') }), {
            id: 'compose-send-blocked',
            action: {
              label: t('compose_card.send_anyway'),
              onClick: () => void handleSendRef.current({ allowUnfilled: true })
            }
          });
          return;
        }
      }

      const written = currentDraft();
      if (!getUidFromEmail(written.from)) {
        toast.error(t('toast.error.send_mail'));
        return;
      }
      sendStartedRef.current = true;
      await sendComposed({
        written,
        replyMessage,
        forwardMessage: historyMessage,
        trackingEnabled,
        onClose: handleClose,
        waitForSave: inFlightSaveRef.current
      });
    },
    [
      notifySendBlocked,
      currentDraft,
      getUidFromEmail,
      handleClose,
      replyMessage,
      historyMessage,
      sendComposed,
      trackingEnabled,
      t
    ]
  );
  handleSendRef.current = handleSendMessage;

  // Scheduled from Send later: the queue owns the message now, so close
  // without saving — an autosave here would put the draft back in Drafts and
  // it could be sent twice.
  const handleScheduled = useCallback(() => {
    debouncedUpdateDraft.cancel();
    sendStartedRef.current = true;
    handleClose();
  }, [debouncedUpdateDraft, handleClose]);

  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  // "Draft saved · Open": where closed edits went, one click from coming back.
  const announceDraftSaved = useCallback(
    (saved: MonoDraft) => {
      toast(t('toast.compose.draft_saved'), {
        id: `draft-saved-${saved.id}`,
        action: {
          label: t('toast.compose.open_draft'),
          onClick: () =>
            void executeCommandRef.current('COMPOSE_NEW_MESSAGE', {
              draft: new MonoDraft(saved.toPlainObject())
            })
        }
      });
    },
    [t]
  );

  const handleDiscard = useCallback(async () => {
    const latest = currentDraft();
    if (!latest.from || !latest.id) return;
    const uid = getUidFromEmail(latest.from);
    const untouchedNewDraft =
      closeOutcome(isUntouched(latest), draftExistedAtOpenRef.current) === 'remove-empty';
    handleClose();
    if (!uid) return;
    try {
      await inFlightSaveRef.current?.catch(() => undefined);
      // Nothing worth an Undo in a compose that was opened and never typed in.
      if (untouchedNewDraft) await removeDraft(uid, latest.id);
      else await discardDraftWithUndo(uid, latest, { reopen: true });
    } catch (e) {
      console.error('Error discarding draft:', e);
    }
  }, [currentDraft, getUidFromEmail, isUntouched, handleClose, removeDraft, discardDraftWithUndo]);

  // Close (Esc, Back, X, or another surface taking over): drafts autosave,
  // so closing keeps the draft without asking — edits are saved now and
  // "Draft saved · Open" says where they went; an untouched new compose just
  // goes away. Discard (with Undo) is the way to throw a draft out.
  const handleCloseButton = useCallback(
    async (onComplete?: () => void) => {
      const latest = currentDraft();
      if (!latest.from || !draft) {
        handleClose();
        onComplete?.();
        return;
      }
      const uid = getUidFromEmail(latest.from);
      const outcome = closeOutcome(isUntouched(latest), draftExistedAtOpenRef.current);
      handleClose();
      if (outcome === 'remove-empty') {
        // Only there if an autosave wrote it (typed, then deleted again).
        if (uid) void removeDraft(uid, latest.id);
      } else if (outcome === 'save') {
        await inFlightSaveRef.current?.catch(() => undefined);
        if (await saveDraftNow(latest, { track: true })) announceDraftSaved(latest);
      }
      onComplete?.();
    },
    [
      currentDraft,
      draft,
      handleClose,
      getUidFromEmail,
      isUntouched,
      removeDraft,
      saveDraftNow,
      announceDraftSaved
    ]
  );

  // Other surfaces (a recipient chip's "New email", "Search for") close the
  // open compose through this. A stable wrapper: jotai would call a bare
  // function as an updater.
  const handleCloseButtonRef = useRef(handleCloseButton);
  handleCloseButtonRef.current = handleCloseButton;
  const closeCompose = useCallback(
    (onComplete?: () => void) => handleCloseButtonRef.current(onComplete),
    []
  );
  useEffect(() => {
    setHandleCloseButton(() => closeCompose);
    return () => {
      setHandleCloseButton((current) => (current === closeCompose ? null : current));
    };
  }, [setHandleCloseButton, closeCompose]);

  // Esc closes compose (the draft is kept, as above) — decided once the
  // keydown has been everywhere, so whatever took it first keeps it: the
  // slash menu, the link / variable popovers, recipient suggestions, a dialog
  // or menu over compose (see escapeClosesCompose).
  useHotkeys(
    'esc',
    (event) => {
      window.setTimeout(() => {
        if (closedRef.current || !escapeClosesCompose(event, document)) return;
        void handleCloseButtonRef.current();
      }, 0);
    },
    {
      scopes: ['GLOBAL_COMPOSE'],
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !isMinimized && !isClosing
    },
    []
  );

  // Replaced by another compose (C, R, F, Enter while this one is open or
  // minimized): save the last edits and say where they went.
  const latestForUnmountRef = useRef({ currentDraft, announceDraftSaved, isUntouched });
  latestForUnmountRef.current = { currentDraft, announceDraftSaved, isUntouched };
  const removeDraftRef = useRef(removeDraft);
  removeDraftRef.current = removeDraft;
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (closedRef.current) return;
      debouncedUpdateDraft.cancel();
      const latest = latestForUnmountRef.current.currentDraft();
      const windows = store.get(globalDraftWindowsAtom);
      const replaced = windows.length > 0 && !windows.some((win) => win.id === latest.id);
      const outcome = closeOutcome(
        latestForUnmountRef.current.isUntouched(latest),
        draftExistedAtOpenRef.current
      );
      if (outcome === 'save') {
        void saveDraftNowRef.current(latest, { track: true }).then((saved) => {
          if (saved && replaced) latestForUnmountRef.current.announceDraftSaved(latest);
        });
        return;
      }
      if (outcome === 'remove-empty' && replaced) {
        const uid = getUidFromEmail(latest.from);
        if (uid) void removeDraftRef.current(uid, latest.id);
      }
    },
    []
  );

  // The signature switcher reports the signature it shows. Its first report is
  // the default being resolved on open: no save for that. A pick by the user
  // is saved like any edit.
  const signatureReportedRef = useRef(false);
  const onSignatureChange = useCallback(
    (signatureId: string | null) => {
      const userPick = signatureReportedRef.current;
      signatureReportedRef.current = true;
      if ((composeDraftRef.current.signatureId || null) === (signatureId || null)) return;
      // Not part of editableSnapshot (it changes on its own on open), so a
      // pick is remembered here for closing to keep it.
      if (userPick) signaturePickedRef.current = true;
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        if (signatureId) {
          updatedDraft.update({ signatureId });
        } else {
          updatedDraft.removeSignatureId();
        }
        return updatedDraft;
      });
      if (userPick) debouncedUpdateDraft();
    },
    [debouncedUpdateDraft]
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
        return updatedDraft;
      });
      debouncedUpdateDraft();
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
        return updatedDraft;
      });
      debouncedUpdateDraft();
    },
    [debouncedUpdateDraft, getUidFromEmail, composeDraft.from]
  );

  const renderDraftStatus = useMemo(() => {
    // Newton-styled status chips: mono uppercase tracked label paired
    // with a small status glyph so the composer state reads as a tiny
    // metadata stamp rather than a floating icon.
    const baseClass =
      'flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground';
    if (draftSaveStatus === 'LOADING' && showSavingStatus) {
      return (
        <span className={baseClass} role="status">
          <Loader className="h-3 w-3" />
          {t('compose_card.status.saving')}
        </span>
      );
    }
    if (draftSaveStatus === 'ERROR') {
      return (
        <span className={cn(baseClass, 'text-destructive')} role="status">
          <MonoIcon type={'AlertCircle'} className="h-3 w-3" />
          {t('compose_card.status.save_failed')}
        </span>
      );
    }
    // Quiet confirmation once the draft is safe (a fast save keeps it up).
    if (hasSaved) {
      return (
        <span className={cn(baseClass, 'text-muted-foreground/80')} role="status">
          <MonoIcon type={'Check'} className="h-3 w-3" />
          {t('compose_card.status.saved')}
        </span>
      );
    }
    return null;
  }, [draftSaveStatus, showSavingStatus, hasSaved, t]);

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
            await updateDraft(uid, currentDraft(), true, true);
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
      composeDraft.from,
      currentDraft,
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
    () => void handleSendRef.current(),
    {
      preventDefault: true,
      enabled: !isMinimized && !isClosing
    },
    []
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
  const toggleCcRow = useCallback(() => toggleRecipientRow('cc'), [toggleRecipientRow]);
  const toggleBccRow = useCallback(() => toggleRecipientRow('bcc'), [toggleRecipientRow]);

  // Reply ↔ Reply all, inside compose: the people on the original the reply
  // doesn't include yet, or (when it has them all) back to the sender only.
  const ownEmails = useMemo(() => accounts.map((account) => account.email), [accounts]);
  const replyAllState = useMemo(() => {
    if (composeKind !== 'reply' || !replyMessage) return null;
    const own = new Set(
      [...ownEmails, composeDraft.from].filter(Boolean).map((email) => email.toLowerCase())
    );
    // A reply to your own message already goes to its recipients.
    if (own.has((replyMessage.from?.email ?? '').toLowerCase())) return null;
    const everyone = buildReplyAllRecipients(replyMessage, own);
    if (everyone.to.length + everyone.cc.length <= 1) return null;
    return toggleReplyAll(
      { to: composeDraft.to, cc: composeDraft.cc },
      everyone,
      replyMessage.from.email
    );
  }, [composeKind, replyMessage, ownEmails, composeDraft.from, composeDraft.to, composeDraft.cc]);
  const replyAllStateRef = useRef(replyAllState);
  replyAllStateRef.current = replyAllState;
  const toggleReplyAllRecipients = useCallback(() => {
    const next = replyAllStateRef.current;
    if (!next) return;
    setComposeDraft((prevDraft) => {
      const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
      updatedDraft.update({ to: next.to, cc: next.cc });
      return updatedDraft;
    });
    debouncedUpdateDraft();
  }, [debouncedUpdateDraft]);
  const replyAllToggle = useMemo<ReplyAllToggle | null>(
    () =>
      replyAllState
        ? {
            mode: replyAllState.mode,
            missing: replyAllState.missing,
            onToggle: toggleReplyAllRecipients
          }
        : null,
    [replyAllState, toggleReplyAllRecipients]
  );

  // Shortcuts shared by the recipient fields, Subject and the body.
  const handleComposeShortcut = useCallback(
    (event: KeyboardEvent | React.KeyboardEvent<HTMLElement>): boolean => {
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
      if (event.code === 'KeyA' && replyAllStateRef.current) {
        event.preventDefault();
        toggleReplyAllRecipients();
        return true;
      }
      return false;
    },
    [toggleMinimize, toggleRecipientRow, toggleReplyAllRecipients]
  );

  const handleHeaderKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Tab order follows the visible fields via natural DOM order
      // (To → Cc/Bcc when shown → Subject); the Cc/Bcc toggles and
      // window buttons are tabIndex={-1} so Tab skips them.
      if (handleComposeShortcut(event)) return;
      if (hasModKey(event) && event.key === 'Enter') {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        if (input && input.value.trim()) {
          // Text typed but not yet a chip isn't in the draft: the field takes
          // this Enter (picks the suggestion / makes the chip), then it sends —
          // unless text is left over (not an address), which stays to fix.
          window.setTimeout(() => {
            if (input.value.trim()) return;
            void handleSendRef.current();
          }, 0);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void handleSendRef.current();
      }
    },
    [handleComposeShortcut]
  );

  const handleSubjectKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (handleComposeShortcut(event)) return;
      if (hasModKey(event) && event.key === 'Enter') {
        event.preventDefault();
        void handleSendRef.current();
        return;
      }
      if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault();
        editorRef.current?.focus();
      }
    },
    [handleComposeShortcut]
  );

  const handleEditorKeyDown = useCallback(
    (view, event: KeyboardEvent) => {
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

      if (hasModKey(event) && event.key === 'Enter') {
        event.preventDefault();
        void handleSendRef.current();
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
              toast.error(t('toast.error.clipboard_read'));
            });
        } else {
          // Fallback for browsers that don't support Clipboard API
          toast.error(t('toast.error.plain_paste_unsupported'));
        }

        return true;
      }

      return handleComposeShortcut(event);
    },
    [handleComposeShortcut, t]
  );

  // A template from the / menu: its body at the caret, and its subject when
  // the message has none yet (it used to be dropped).
  const handleSelectTemplate = useCallback(
    (template: IMonoTemplate) => {
      editorRef.current?.insertContent(template.body);
      const subject = template.subject?.trim();
      if (subject && !composeDraftRef.current.subject.trim()) {
        handleInputChange('subject', subject);
      }
    },
    [handleInputChange]
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
      onTransitionEnd={(event) => {
        // The close fade is done: remove the window.
        if (isClosing && event.target === event.currentTarget && event.propertyName === 'opacity') {
          finishClose();
        }
      }}
      className={cn(
        // Opacity only, 150 ms; nothing that lays out per frame.
        'absolute inset-0 z-40 transition-opacity duration-150 ease-out motion-reduce:transition-none',
        isMinimized
          ? 'pointer-events-none flex items-end justify-center px-6 pb-6'
          : 'flex flex-col bg-background',
        // Closing, the fading window lets clicks through to what's under it.
        isClosing ? 'pointer-events-none' : !isMinimized && 'pointer-events-auto',
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
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => void closeCompose()}
              tooltip={t('tooltip.back')}
              shortcut="ESC"
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
      {/* A column, so the card can shrink to a short window and the body
          scrolls instead of the footer going off-screen. */}
      <div
        className={cn(
          'pointer-events-none flex min-h-0 flex-1 flex-col items-center px-8',
          isMinimized ? 'contents' : 'pb-8'
        )}
      >
        <Card
          className={cn(
            'flex flex-col border border-foreground/[0.06] bg-card dark:border-white/[0.06]',
            !isClosing && 'pointer-events-auto',
            // Opacity + transform only, 150 ms (size changes on minimize /
            // maximize apply at once instead of animating layout).
            'w-full min-w-0 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
            // Only as tall as what's in it, so Send sits right under the
            // message; it grows as you write, up to the cap, then the body
            // scrolls. Maximized fills the window.
            isMaximized ? 'min-h-0 max-w-[960px] flex-1' : 'max-h-[720px] min-h-0 max-w-[768px]',
            isMinimized
              ? 'max-h-12 min-h-12 min-w-80 max-w-80 rounded-xl shadow-md'
              : 'rounded-md shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_10px_28px_-14px_hsl(var(--foreground)/0.14)] dark:shadow-none',
            isVisible && !isClosing ? '' : 'translate-y-2 opacity-0',
            className
          )}
        >
          <CardHeader className={cn('justify-center space-y-0 p-0')}>
            <ComposeCardHeader
              composeDraft={composeDraft}
              handleInputChange={handleInputChange}
              onKeyDown={handleHeaderKeyDown}
              onClose={closeCompose}
              onMinimize={toggleMinimize}
              onMaximize={toggleMaximize}
              isMinimized={isMinimized}
              isMaximized={isMaximized}
              ccVisible={ccVisible}
              bccVisible={bccVisible}
              onToggleCc={toggleCcRow}
              onToggleBcc={toggleBccRow}
              replyAll={replyAllToggle}
            />
          </CardHeader>
          {/* Kept mounted while minimized (hidden, so nothing inside can be
              tabbed to): unmounting threw away the caret, undo history and
              scroll position. */}
          {/* flex-auto, not flex-1 or h-full, down to the scroll area: in a
              card sized by its content those collapse or stop constraining,
              and the body would be clipped instead of scrolling. */}
          <CardContent
            className={cn(
              'no-drag relative flex min-h-0 flex-auto flex-col overflow-hidden p-0',
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
            <div className="flex min-h-0 flex-auto flex-col">
              <div className="px-9 pb-1 pt-3">
                <Input
                  ref={subjectRef}
                  variant="transparent"
                  placeholder={t('text_editor.placeholder.subject')}
                  className="h-auto border-none px-0 py-0 text-[14px] font-semibold tracking-normal text-foreground placeholder:text-muted-foreground/80"
                  value={composeDraft.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  onKeyDown={handleSubjectKeyDown}
                />
              </div>
              <div
                className="relative min-h-0 flex-auto overflow-y-auto overscroll-contain pb-4"
                // Blank space below everything (a maximized card is taller
                // than its content) writes at the end of the message, like
                // clicking under a document's text. Not on the scrollbar.
                onMouseDown={(event) => {
                  const area = event.currentTarget;
                  if (event.target !== area || event.button !== 0) return;
                  if (event.nativeEvent.offsetX >= area.clientWidth) return;
                  const last = area.lastElementChild;
                  if (last && event.clientY < last.getBoundingClientRect().bottom) return;
                  event.preventDefault();
                  editorRef.current?.focus('end');
                }}
              >
                {/* Rendered with the card (TipTap is in the main bundle);
                    first focus is set in the same commit. */}
                <TextEditor
                  ref={setEditorHandle}
                  autofocus={false}
                  className={cn(editorMinHeightClass, 'px-9 py-4 text-[14px]')}
                  value={initialBody}
                  onDirty={handleBodyDirty}
                  onUploadInlineImage={handleUploadInlineImage}
                  onUploadAttachment={handleAttachmentUpload}
                  onSelectTemplate={handleSelectTemplate}
                  draftId={composeDraft.id}
                  onEditorKeyDown={handleEditorKeyDown}
                />
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
                {composeKind !== 'new' && originalStatus === 'failed' && (
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
              getLatestDraft={currentDraft}
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
