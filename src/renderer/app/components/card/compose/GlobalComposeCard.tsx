// Updated GlobalComposeCard.tsx
import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { IMonoTemplate } from '@/main/api/template/types';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoAttachment } from '@/main/models/types';
import { generateUUID } from '@/main/utils'; // Import getUidFromEmail
import tailwindCSS from '@/renderer/app/assets/style/tailwind.css?raw';
import ComposeCardFooter from '@/renderer/app/components/card/compose/ComposeCardFooter';
import ComposeCardHeader from '@/renderer/app/components/card/compose/ComposeCardHeader';
import ReferenceCard from '@/renderer/app/components/card/compose/ReferenceCard';
import MonoIcon from '@/renderer/app/components/icons/icons';
import SignatureSwitcher from '@/renderer/app/components/mail/SignatureSwitcher';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import { Input } from '@/renderer/app/components/ui/input';
import Loader from '@/renderer/app/components/ui/loader';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import {
  DBDeleteAttachmentBlob,
  DBSaveAttachmentBlob
} from '@/renderer/app/lib/db/draftAttachment';
import { DBGetMessage, DBSaveMessage } from '@/renderer/app/lib/db/message';
import { formatForwardedMessage } from '@/renderer/app/lib/formatBody';
import { getAttachmentIcon } from '@/renderer/app/lib/getAttachmentIcon';
import { cn } from '@/renderer/app/lib/utils';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
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

const GlobalComposeCard: React.FC<GlobalComposeCardProps> = ({ className, draft }) => {
  const { preference, getUidFromEmail, accounts } = useAuth();
  const { templates } = useTemplateAtom();
  const { t } = useTranslation();
  const executeCommand = useExecuteCommand();
  const { signatures, getSignatureById } = useSignatureAtom();
  const { contactArray } = useContactAtom();
  const { openDialog } = useDialogs();
  const { updateDraft, sendDraft, removeDraft } = useDraftAtom();
  const { setGlobalDraftWindows } = useComposeWindowAtom();
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { trackEvent } = useUserTrackingData();
  const [isSending, setIsSending] = useState(false);
  const [isAttachmentDropActive, setIsAttachmentDropActive] = useState(false);
  const trackingEnabled = true;

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
  const [draftSaveStatus, setDraftSaveStatus] = useState<
    'INITIALIZED' | 'LOADING' | 'SAVED' | 'ERROR'
  >('INITIALIZED');
  const editorRef = useRef<{ setContent: (content: string) => void; focus: () => void } | null>(
    null
  );

  const subjectRef = useRef<HTMLInputElement>(null);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      return !prev;
    });
  }, []);
  const toggleMaximize = useCallback(() => {
    setIsMinimized(false);
    setIsMaximized((prev) => {
      return !prev;
    });
  }, []);

  // Helper function to handle different draft save errors
  const handleDraftSaveError = useCallback(
    (error: any) => {
      console.error('Error saving draft:', error);

      // Check for specific error types
      if (error?.status === 500 && error?.data?.includes?.('Refresh token expired')) {
        toast.error(t('toast.error.account_expired'));
      } else if (error?.status === 500 && error?.data?.includes?.('Re-authentication required')) {
        toast.error(t('toast.error.account_expired'));
      } else if (error?.status === 401 || error?.status === 403) {
        toast.error(t('toast.error.account_expired'));
      } else {
        toast.error(t('toast.error.save_draft'));
      }
    },
    [t]
  );

  const updateMessage = async (draft: MonoDraft) => {
    const uid = getUidFromEmail(draft.from);
    if (draft.from && uid) {
      apiClient.setApiActiveUid(uid);
      try {
        setDraftSaveStatus('LOADING');
        await updateDraft(uid, draft, true, true);
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
  const memoizedSignatures = useMemo(() => signatures, [signatures]);
  const memoizedTemplates = useMemo(() => templates, [templates]);
  const memoizedContactArray = useMemo(() => contactArray, [contactArray]);

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
              await updateDraft(uid, draft, true, true);
              setDraftSaveStatus('SAVED');
            } catch (error) {
              handleDraftSaveError(error);
              setDraftSaveStatus('ERROR');
            }
          }
        }
      }, 1000),
    [updateDraft, getUidFromEmail, handleDraftSaveError]
  );

  const handleClose = useCallback(() => {
    setIsMaximized(false);
    setIsClosing(true);
    setTimeout(() => {
      setGlobalDraftWindows((prev) => prev.filter((win) => win.id !== draft?.id));
    }, 400);
  }, [draft, isMaximized]);

  useEffect(() => {
    setIsVisible(true); // Trigger grow animation
    requestAnimationFrame(() => editorRef.current?.focus());
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
  // Create a loading component for the editor
  const EditorLoadingFallback = () => (
    <div className="h-32 animate-pulse rounded">
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-muted"></div>
        <div className="h-4 w-1/2 rounded bg-muted"></div>
        <div className="h-4 w-2/3 rounded bg-muted"></div>
      </div>
    </div>
  );

  const handleSendMessage = useCallback(async () => {
    if (isSending || composeDraft.to.length === 0 || !composeDraft.from) return;

    setIsSending(true);

    try {
      // Prepare the updated draft
      const updatedDraft: MonoDraft = new MonoDraft({
        ...composeDraft.toPlainObject(),
        threadId: composeDraft.threadId.length > 20 ? undefined : composeDraft.threadId,
        messageId: composeDraft.threadId.length > 20 ? undefined : composeDraft.messageId
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
            Undo <ShortcutKeyboard variant="text" className="gap-0 p-0" shortcut={'MOD+Z'} />
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
    trackingEnabled
  ]);

  const [historyMessage, setHistoryMessages] = useState<MonoMessage | null>(null);
  const [replyMessage, setReplyMessages] = useState<MonoMessage | null>(null);

  useEffect(() => {
    const fetchMessage = async () => {
      if (composeDraft.from && composeDraft.messageId) {
        try {
          // TEMP TODO
          const uid = getUidFromEmail(composeDraft.from);

          if (uid) {
            let message = await DBGetMessage(uid, composeDraft.messageId);

            // If message doesn't exist in DB, fetch from Gmail API
            if (!message) {
              const messageResponse = await mailApi.getMessage(uid, composeDraft.messageId);

              if (messageResponse?.payload) {
                message = MonoMessage.fromGmailMessage(messageResponse);
                // Save to DB for future use
                await DBSaveMessage(uid, message);
              }
            }

            // Process the message if we have it (either from DB or API)
            if (message) {
              if (composeDraft.subject.toLowerCase().startsWith('fwd: ')) {
                setHistoryMessages(message);
              } else if (composeDraft.subject.toLowerCase().startsWith('re: ')) {
                setReplyMessages(message);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching message:', error);
        }
      }
    };

    fetchMessage();
  }, [composeDraft, draftSaveStatus]);

  const handleDiscard = useCallback(async () => {
    if (composeDraft.from && composeDraft.id) {
      try {
        setDraftSaveStatus('LOADING');
        handleClose();
        const uid = getUidFromEmail(composeDraft.from);
        if (uid) {
          await removeDraft(uid, composeDraft.id);
        }
        setDraftSaveStatus('SAVED');
      } catch (e) {
        console.error('Error discarding draft:', e);
        setDraftSaveStatus('ERROR');
      }
    }
  }, [composeDraft.from, composeDraft.id, getUidFromEmail, handleClose, removeDraft]);

  const handleCloseButton = useCallback(
    async (onComplete?: () => void) => {
      if (!composeDraft.from || !draft) return;

      if (JSON.stringify(composeDraft.toPlainObject()) !== JSON.stringify(draft.toPlainObject())) {
        openDialog('saveDraft', {
          onSave: async () => {
            handleClose();
            await updateMessage(composeDraft);
            onComplete?.();
          },
          onDiscard: async () => {
            handleClose();
            await updateMessage(draft);
            onComplete?.();
          }
        });
      } else {
        handleClose();
        onComplete?.();
      }
    },
    [composeDraft, draft, handleClose, openDialog, updateMessage]
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

  const onTemplateChange = useCallback(
    (template: IMonoTemplate) => {
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());

        updatedDraft.update({
          body: template.body.length > 0 ? template.body : undefined,
          subject: template.subject && template.subject.length > 0 ? template.subject : undefined
        });
        updateMessage(updatedDraft);
        if (editorRef.current) {
          editorRef.current.setContent(template.body);
        }
        return updatedDraft;
      });
    },
    [updateMessage]
  );

  const onBodyChange = useCallback(
    (body: string) => {
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());

        updatedDraft.update({
          body: body.length > 0 ? body : undefined
        });
        updateMessage(updatedDraft);
        return updatedDraft;
      });
      if (editorRef.current && body.length > 0) {
        editorRef.current.setContent(body);
      }
    },
    [updateMessage]
  );

  const onAttachmentChange = useCallback(
    async (attachmentId: string, file: File) => {
      if (!composeDraft.from) return;

      setDraftSaveStatus('LOADING');

      try {
        const uid = getUidFromEmail(composeDraft.from);
        if (uid) {
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

          const updatedAttachments = {
            ...composeDraft.attachments,
            [attachmentId]: {
              attachmentId,
              fileName: file.name,
              mimeType: file.type,
              size: file.size
            }
          };
          composeDraft.update({ attachments: updatedAttachments });
          setComposeDraft(composeDraft);
          setDraftSaveStatus('SAVED');
          trackEvent('email_attachment_uploaded', {
            draft_id: composeDraft.id,
            attachment_id: attachmentId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type
          });
        }
      } catch (error) {
        console.error('Error updating draft with attachment:', error);
        setDraftSaveStatus('ERROR');
        throw error;
      }
    },
    [composeDraft, getUidFromEmail, trackEvent]
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
    switch (draftSaveStatus) {
      case 'INITIALIZED':
        return null;
      case 'LOADING':
        return (
          <span className={baseClass}>
            <Loader className="h-3 w-3" />
            Saving
          </span>
        );
      case 'SAVED':
        return null;
      case 'ERROR':
        return (
          <span className={cn(baseClass, 'text-destructive')}>
            <MonoIcon type={'AlertCircle'} className="h-3 w-3" />
            Save failed
          </span>
        );
    }
  }, [draftSaveStatus]);

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

  // Memoize attachment rendering

  const filesToUpload = useRef<Record<string, File>>({});

  // Handle file input click
  const MAX_FILE_SIZE_MB = 25;

  const handleFileChange = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;

      if (draftSaveStatus === 'INITIALIZED') {
        if (!composeDraft.from) {
          toast.error(t('toast.error.no_email_to_save'));
          return;
        }

        try {
          const uid = getUidFromEmail(composeDraft.from);
          if (uid) {
            await updateDraft(uid, composeDraft, true, true);
          }
        } catch (error) {
          handleDraftSaveError(error);
          return;
        }
      }

      const newFiles = Array.from(fileList);
      const uploadPromises = newFiles.map(async (file) => {
        const uniqueId = generateUUID();

        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error(t('toast.error.file_too_large'));
          return;
        }

        setAttachments((prev) => ({
          ...prev,
          [uniqueId]: {
            attachmentId: uniqueId,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'loading',
            errorMessage: ''
          }
        }));

        filesToUpload.current[uniqueId] = file;

        try {
          await onAttachmentChange(uniqueId, file);
          setAttachments((prev) => ({
            ...prev,
            [uniqueId]: {
              ...prev[uniqueId],
              status: 'success',
              errorMessage: ''
            }
          }));
          delete filesToUpload.current[uniqueId];
        } catch (error: any) {
          let errorMessage = 'Upload failed';

          if (error.response?.status === 413) {
            errorMessage = 'File too large';
            toast.error(t('toast.error.file_too_large'));
          } else if (error.response?.status === 500) {
            errorMessage = 'Server error';
            toast.error(t('toast.error.file_upload_server'));
          } else {
            errorMessage = 'Network error';
            toast.error(t('toast.error.file_upload_network'));
          }

          setAttachments((prev) => ({
            ...prev,
            [uniqueId]: {
              ...prev[uniqueId],
              status: 'invalid',
              errorMessage
            }
          }));
        }
      });

      await Promise.allSettled(uploadPromises);
    },
    [
      composeDraft,
      draftSaveStatus,
      getUidFromEmail,
      handleDraftSaveError,
      onAttachmentChange,
      t,
      updateDraft
    ]
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

  useHotkeys('MOD+ENTER', handleSendMessage, { preventDefault: true }, [handleSendMessage]);
  useHotkeys('MOD+SHIFT+M', toggleMinimize, { preventDefault: true, scopes: ['GLOBAL_COMPOSE'] }, [
    toggleMinimize
  ]);

  const memoizedAttachments = useMemo(() => {
    const uid = getUidFromEmail(composeDraft.from);
    const attachmentEntries = Object.entries(attachments);
    if (!uid || (attachmentEntries.length === 0 && !isAttachmentDropActive)) return null;

    return (
      <div
        className={cn(
          'shrink-0 border-t border-border/60 px-9 py-2.5 transition-colors',
          isAttachmentDropActive && 'border-chart-1/40 bg-chart-1/5'
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <MonoIcon
            type="Paperclip"
            className={cn('h-3.5 w-3.5', isAttachmentDropActive && 'text-chart-1')}
          />
          <span>{isAttachmentDropActive ? 'Drop to attach' : 'Attachments'}</span>
          {attachmentEntries.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
              {attachmentEntries.length} file{attachmentEntries.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {attachmentEntries.length === 0 ? (
          <div className="rounded-md border border-dashed border-chart-1/50 bg-background/70 px-3 py-2 text-[13px] text-muted-foreground">
            Attach files to this email
          </div>
        ) : (
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
                      aria-label={`Preview ${attachment.fileName}`}
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
                        <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground">
                          {attachment.status === 'loading'
                            ? 'Uploading'
                            : isInvalid
                              ? attachment.errorMessage || 'Upload failed'
                              : formatAttachmentSize(attachment.size)}
                        </span>
                      </span>
                    </button>

                    {isInvalid && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center text-destructive">
                            <MonoIcon type="AlertCircle" className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {attachment.errorMessage || 'Upload failed'}
                        </TooltipContent>
                      </Tooltip>
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
                      tooltip="Remove attachment"
                    >
                      <MonoIcon type={'X'} className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }, [
    attachments,
    composeDraft.from,
    composeDraft.id,
    getUidFromEmail,
    handleFileDelete,
    isAttachmentDropActive,
    openDialog
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
          className="min-h-[210px] px-9 py-4 text-[14px]"
          value={composeDraft.body}
          onChange={handleInputChange.bind(null, 'body')}
          onUploadInlineImage={handleUploadInlineImage}
          onUploadAttachment={handleAttachmentUpload}
          draftId={composeDraft.id}
          onEditorKeyDown={(view, event) => {
            const { state } = view;
            const { from, to } = state.selection;

            const isEntireContentSelected = from !== 1 || to !== 1;

            if (event.key === 'Backspace') {
              if (isEntireContentSelected) {
                return false;
              }
              if (from === 1) {
                event.preventDefault();
                subjectRef.current?.focus();
                return true;
              }
            }

            if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
              event.preventDefault();
              toggleMinimize();
              return true;
            }
            if (event.metaKey && event.code === 'Enter') {
              event.preventDefault();
              handleSendMessage();
              return true;
            }

            // Handle Cmd+Shift+V for plain text paste
            if (event.metaKey && event.shiftKey && event.code === 'KeyV') {
              event.preventDefault();

              // Try to get plain text from clipboard
              if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard
                  .readText()
                  .then((text) => {
                    if (text) {
                      // Insert plain text at current selection without any formatting
                      const { from, to } = view.state.selection;

                      // Create a transaction that replaces the selection with plain text
                      const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(text));
                      view.dispatch(tr);
                    }
                  })
                  .catch((error) => {
                    console.error('Failed to read clipboard text:', error);
                    // Fallback: show a message to the user
                    toast.error(
                      'Failed to read clipboard. Please use regular paste (Cmd+V) instead.'
                    );
                  });
              } else {
                // Fallback for browsers that don't support Clipboard API
                toast.error(
                  'Plain text paste not supported in this browser. Please use regular paste (Cmd+V) instead.'
                );
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
    handleSendMessage
  ]);

  return (
    <div
      tabIndex={-1}
      className={cn(
        'absolute inset-0 z-40 origin-bottom transition-all duration-300',
        isMinimized
          ? 'pointer-events-none flex items-end justify-center px-6 pb-6'
          : 'pointer-events-auto flex flex-col bg-white dark:bg-background'
      )}
    >
      {!isMinimized && (
        <div className="grid h-[72px] shrink-0 grid-cols-[1fr_minmax(0,768px)_1fr] items-center px-8">
          <div className="flex justify-start">
            <Button
              variant="ghost"
              sizeVariant="sm"
              typeVariant="icon"
              className="pointer-events-auto h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => void handleCloseButton()}
              tooltip={t('tooltip.close')}
            >
              <MonoIcon type="ChevronLeft" className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex min-w-0 items-center">
            <h1 className="truncate text-[24px] font-medium tracking-normal text-foreground">
              New Message
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
            'ease-bounce-in-out pointer-events-auto flex flex-col border border-border/25 bg-card dark:bg-background',
            'w-full min-w-0 transition-all duration-300',
            isMaximized ? 'h-full min-h-0 max-w-[960px]' : 'h-[405px] min-h-[405px] max-w-[768px]',
            isMinimized
              ? 'max-h-12 min-h-12 min-w-80 max-w-80 rounded-xl shadow-md'
              : 'rounded-md shadow-[0_1px_2px_rgb(15_23_42_/_0.035),0_10px_24px_-22px_rgb(15_23_42_/_0.22),-8px_10px_22px_-18px_rgb(15_23_42_/_0.12),8px_10px_22px_-18px_rgb(15_23_42_/_0.12)] ring-1 ring-slate-950/[0.025] dark:shadow-[0_1px_2px_rgb(255_255_255_/_0.03),0_12px_26px_-22px_rgb(0_0_0_/_0.36),-8px_10px_22px_-18px_rgb(0_0_0_/_0.26),8px_10px_22px_-18px_rgb(0_0_0_/_0.26)] dark:ring-white/[0.04]',

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
                if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
                  event.preventDefault();
                  toggleMinimize();
                }
              }}
              onClose={handleCloseButton}
              onMinimize={toggleMinimize}
              onMaximize={toggleMaximize}
              isMinimized={isMinimized}
              isMaximized={isMaximized}
              draftStatus={renderDraftStatus}
            />
          </CardHeader>
          {!isMinimized && (
            <>
              <CardContent
                className="no-drag relative min-h-0 flex-1 overflow-hidden p-0"
                onDragEnterCapture={handleAttachmentDragEnter}
                onDragOverCapture={handleAttachmentDragOver}
                onDragLeaveCapture={handleAttachmentDragLeave}
                onDropCapture={handleAttachmentDrop}
              >
                {isAttachmentDropActive && (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-md border border-chart-1/40 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm">
                      <MonoIcon type="Paperclip" className="h-4 w-4 text-chart-1" />
                      <span>Drop file here</span>
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
                        if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
                          event.preventDefault();
                          editorRef.current?.focus();
                        }
                        if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
                          event.preventDefault();
                          toggleMinimize();
                        }
                        if (event.metaKey && event.code === 'Enter') {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                  </div>
                  <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
                    {!composeDraft.body.replace(/<[^>]*>/g, '').trim() && (
                      <div className="pointer-events-none absolute left-9 top-4 z-10 text-[14px] font-medium text-muted-foreground/75">
                        Tip: Hit ⌘J for AI
                      </div>
                    )}
                    {renderEditor}
                    <div className="px-4 text-sm">
                      <SignatureSwitcher
                        draft={composeDraft}
                        onSignatureChange={onSignatureChange}
                      />
                    </div>

                    {historyMessage && (
                      <div className="mt-4 px-3 text-sm">
                        <ReferenceCard
                          accountId={getUidFromEmail(composeDraft.from) as string}
                          type={'forward'}
                          item={historyMessage}
                        />
                      </div>
                    )}
                    {replyMessage && (
                      <div className="mt-4 px-3 text-sm">
                        <ReferenceCard
                          accountId={getUidFromEmail(composeDraft.from) as string}
                          type={'reply'}
                          item={replyMessage}
                        />
                      </div>
                    )}
                  </div>
                  {memoizedAttachments}
                </div>
              </CardContent>
              <div
                className={cn('transition-colors', isAttachmentDropActive && 'bg-chart-1/5')}
                onDragEnterCapture={handleAttachmentDragEnter}
                onDragOverCapture={handleAttachmentDragOver}
                onDragLeaveCapture={handleAttachmentDragLeave}
                onDropCapture={handleAttachmentDrop}
              >
                <ComposeCardFooter
                  draft={composeDraft}
                  draftSaveStatus={draftSaveStatus}
                  handleSendMessage={handleSendMessage}
                  handleFileChange={handleFileChange}
                  sendDisabled={
                    composeDraft.to.length === 0 ||
                    !composeDraft.from ||
                    draftSaveStatus === 'LOADING'
                  }
                  onDiscard={handleDiscard}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default GlobalComposeCard;
