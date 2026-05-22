// Updated GlobalComposeCard.tsx
import aiApi from '@/main/api/ai/aiApi';
import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import { IMonoTemplate } from '@/main/api/template/types';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoAttachment } from '@/main/models/types';
import { generateUUID } from '@/main/utils'; // Import getUidFromEmail
import tailwindCSS from '@/renderer/app/assets/style/tailwind.css?raw';
import AIComposeCard from '@/renderer/app/components/card/compose/AIComposeCard';
import ComposeCardFooter from '@/renderer/app/components/card/compose/ComposeCardFooter';
import ComposeCardHeader from '@/renderer/app/components/card/compose/ComposeCardHeader';
import ReferenceCard from '@/renderer/app/components/card/compose/ReferenceCard';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AttachmentItem from '@/renderer/app/components/mail/attachment/AttachmentItem';
import SignatureSwitcher from '@/renderer/app/components/mail/SignatureSwitcher';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent, CardHeader } from '@/renderer/app/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Input } from '@/renderer/app/components/ui/input';
import Loader from '@/renderer/app/components/ui/loader';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';
import { DBGetMessage, DBSaveMessage } from '@/renderer/app/lib/db/message';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { formatForwardedMessage } from '@/renderer/app/lib/formatBody';
import { cn } from '@/renderer/app/lib/utils';
// useBillingAtom removed — payment-free build.
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { animated, useTransition } from '@react-spring/web';
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

const GlobalComposeCard: React.FC<GlobalComposeCardProps> = ({ className, draft }) => {
  const { preference, getUidFromEmail, accounts, getAccountByUid } = useAuth();
  const { templates } = useTemplateAtom();
  const { t } = useTranslation();
  const executeCommand = useExecuteCommand();
  const { signatures, getSignatureById } = useSignatureAtom();
  // Payment-free build — every plan gate evaluates as pro.
  const hasProAccess = true;
  const { contactArray } = useContactAtom();
  const { openDialog } = useDialogs();
  const { updateDraft, sendDraft, removeDraft } = useDraftAtom();
  const { setGlobalDraftWindows } = useComposeWindowAtom();
  const { sidebarCollapsed } = useSidebarAtom();
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(preference.compose.fullscreen);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { trackEvent } = useUserTrackingData();
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(true);

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

  const [isAiComposeOpen, setIsAiComposeOpen] = useState(false);

  const aiComposeTransitions = useTransition(isAiComposeOpen, {
    from: { transform: 'translateY(100%)', opacity: 0 },
    enter: { transform: 'translateY(0%)', opacity: 1 },
    leave: { transform: 'translateY(100%)', opacity: 0 },
    config: { tension: 200, friction: 20 } // Adjust for smoothness
  });

  const handleAiButtonClick = useCallback(() => {
    setIsAiComposeOpen((prev) => !prev);
  }, []);

  const handleTrackingChange = useCallback((enabled: boolean) => {
    setTrackingEnabled(enabled);
  }, []);

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

  const handleGenerateSubject = useCallback(async () => {
    if (!composeDraft.body || composeDraft.body.trim().length === 0) {
      toast.error(t('compose_card.subject_generation.no_content_error'));
      return;
    }

    const uid = getUidFromEmail(composeDraft.from);
    if (!uid) {
      toast.error(t('compose_card.subject_generation.no_account_error'));
      return;
    }

    // Check if user has pro access
    if (!hasProAccess) {
      openDialog('preference', { defaultPage: 'billing' });
      return;
    }

    setIsGeneratingSubject(true);

    try {
      // Set API active UID
      apiClient.setApiActiveUid(uid);

      // Strip HTML tags from body content for better AI processing
      const textContent = composeDraft.body.replace(/<[^>]*>/g, '').trim();

      const response = await aiApi.generateSubject(textContent);

      // Update the subject field
      handleInputChange('subject', response.subject);

      // Track the event
      trackEvent('ai_subject_generated', {
        draft_id: composeDraft.id,
        body_length: textContent.length,
        generated_subject_length: response.subject.length
      });
    } catch (error) {
      console.error('Error generating subject:', error);
      toast.error(t('compose_card.subject_generation.error'));
    } finally {
      setIsGeneratingSubject(false);
    }
  }, [
    composeDraft.body,
    composeDraft.from,
    composeDraft.id,
    getUidFromEmail,
    hasProAccess,
    openDialog,
    handleInputChange,
    trackEvent,
    t
  ]);

  const handleUploadInlineImage = useCallback(
    async (file: File, uuid: string, draftId: string) => {
      const uid = getUidFromEmail(composeDraft.from);
      if (uid) apiClient.setApiActiveUid(uid);
      else throw new Error('No active account');

      if (draftSaveStatus === 'INITIALIZED') {
        if (!composeDraft.from) {
          toast.error(t('toast.error.no_email_to_save'));
          throw new Error('No from email to save the draft.');
        }

        try {
          await updateDraft(uid, composeDraft, true, true);
        } catch (error) {
          handleDraftSaveError(error);
          throw new Error('Error saving draft.');
        }
      }

      return draftApi.uploadInlineImage(uid, file, uuid, draftId);
    },
    [composeDraft, draftSaveStatus, getUidFromEmail, handleDraftSaveError, t, updateDraft]
  );
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
            monoLocalStorageDb.decrementSentEmailsCount();
          },
          <span className="inline-flex items-end gap-1">
            Undo <ShortcutKeyboard variant="text" className="gap-0 p-0" shortcut={'MOD+Z'} />
          </span>,
          trackingEnabled
        );

        handleClose();

        // Increment sent emails count and check if it's the second email
        const sentEmailsCount = await monoLocalStorageDb.incrementSentEmailsCount();
        if (sentEmailsCount === 3) {
          openDialog('nps', { eventType: 'third_email' });
        }

        trackEvent('email_sent', {
          draft_id: composeDraft.id,
          thread_id: composeDraft.threadId,
          recipient_count: composeDraft.to.length,
          cc_count: composeDraft.cc.length,
          bcc_count: composeDraft.bcc.length,
          subject_length: composeDraft.subject.length,
          body_length: composeDraft.body.length,
          has_attachments: Object.keys(composeDraft.attachments).length > 0,
          used_ai_draft: usedAiDraft
        });
      } else {
        handleClose();
        updateMessage(composeDraft);
        executeCommand('COMPOSE_NEW_MESSAGE', { draft: composeDraft });
      }
    } catch (e) {
      updateMessage(composeDraft);
      setGlobalDraftWindows([composeDraft]);
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

              if (messageResponse) {
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

  const onFromChange = useCallback(
    async (email: string, uid: string) => {
      const currentFromEmail = composeDraft.from;
      const currentUid = currentFromEmail ? getUidFromEmail(currentFromEmail) : null;

      if (currentUid && currentUid !== uid && composeDraft.id) {
        try {
          await removeDraft(currentUid, composeDraft.id, false);

          setComposeDraft((prevDraft) => {
            const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
            updatedDraft.update({
              from: email
            });

            apiClient.setApiActiveUid(uid);
            updateMessage(updatedDraft);

            return updatedDraft;
          });
        } catch (error) {
          console.error('Error handling draft transfer between accounts:', error);
          toast.error(t('toast.error.transfer_draft'));
        }
      } else {
        setComposeDraft((prevDraft) => {
          const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
          updatedDraft.update({ from: email });

          apiClient.setApiActiveUid(uid);
          updateMessage(updatedDraft);

          return updatedDraft;
        });
      }
    },
    [composeDraft.from, composeDraft.id, getUidFromEmail, removeDraft, t, updateMessage]
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

  const onAcceptAiResponse = useCallback(
    (raw: string) => {
      const stringWithNewlines = raw;

      const htmlParagraphs = stringWithNewlines
        .split('\n\n')
        .map((paragraph) => {
          return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
        })
        .join('');

      // Append to existing content instead of replacing
      const existingBody = composeDraft.body || '';
      const newBody = existingBody ? `${existingBody}${htmlParagraphs}` : htmlParagraphs;

      onBodyChange(newBody);
      setUsedAiDraft(true);
      trackEvent('ai_draft_used', {
        draft_id: composeDraft.id,
        ai_draft_length: raw.length
      });
    },
    [composeDraft.id, composeDraft.body, onBodyChange, trackEvent]
  );

  const onAttachmentChange = useCallback(
    async (attachmentId: string, file: File) => {
      if (!composeDraft.from) return;

      setDraftSaveStatus('LOADING');

      try {
        const uid = getUidFromEmail(composeDraft.from);
        if (uid) {
          await draftApi.uploadAttachment(uid, attachmentId, composeDraft.id, file);

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
      setComposeDraft((prevDraft) => {
        const updatedDraft = new MonoDraft(prevDraft.toPlainObject());
        const updatedAttachments = { ...updatedDraft.attachments };
        delete updatedAttachments[attachmentId];
        updatedDraft.update({ attachments: updatedAttachments });
        updateMessage(updatedDraft);
        return updatedDraft;
      });
    },
    [updateMessage]
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
        return (
          <span className={baseClass}>
            <MonoIcon type={'CheckCircle'} className="h-3 w-3" />
            Saved
          </span>
        );
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
      const fileList = {
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
        [0]: file,
        [Symbol.iterator]: function* () {
          yield file;
        }
      } as FileList;

      await handleFileChange(fileList);
    },
    [handleFileChange]
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

  useHotkeys('MOD+SHIFT+F', toggleMaximize, { preventDefault: true, scopes: ['GLOBAL_COMPOSE'] }, [
    toggleMaximize
  ]);
  useHotkeys('MOD+ENTER', handleSendMessage, { preventDefault: true }, [handleSendMessage]);
  useHotkeys('MOD+SHIFT+M', toggleMinimize, { preventDefault: true, scopes: ['GLOBAL_COMPOSE'] }, [
    toggleMinimize
  ]);

  const memoizedAttachments = useMemo(() => {
    const uid = getUidFromEmail(composeDraft.from);
    if (!uid) return null;

    return Object.entries(attachments).map(([id, attachment]) => (
      <div key={attachment.attachmentId} className="flex items-center gap-1">
        <AttachmentItem
          accountId={uid}
          source={'draft'}
          itemId={composeDraft.id}
          preview
          disabled={attachment.status !== 'success'}
          attachment={attachment}
        >
          <div className="ml-auto flex items-center">
            {attachment.status === 'loading' ? (
              <Loader className="ml-2" />
            ) : attachment.status === 'invalid' ? (
              <Tooltip>
                <TooltipTrigger>
                  <MonoIcon type="AlertCircle" className="ml-2 h-4 w-4 text-destructive" />
                </TooltipTrigger>
                <TooltipContent>{attachment.errorMessage || 'Upload failed'}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                className="-mr-2 ml-1"
                type="button"
                variant={'ghost'}
                sizeVariant={'xs'}
                typeVariant={'icon'}
                disabled={attachment.status !== 'success'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFileDelete(id);
                }}
              >
                <MonoIcon type={'X'} className="h-4 w-4" />
              </Button>
            )}
          </div>
        </AttachmentItem>
      </div>
    ));
  }, [attachments, composeDraft.from, composeDraft.id, handleFileDelete, getUidFromEmail]);

  // Optimize render method for editor section
  const renderEditor = useMemo(() => {
    if (!isEditorMounted) {
      return <EditorLoadingFallback />;
    }

    return (
      <Suspense fallback={<EditorLoadingFallback />}>
        <TextEditor
          ref={editorRef}
          className="pt-0"
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

            if (event.metaKey && event.shiftKey && event.code === 'KeyF') {
              event.preventDefault();
              toggleMaximize();
              return true;
            }
            if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
              event.preventDefault();
              toggleMinimize();
              return true;
            }
            if (event.metaKey && event.code === 'KeyJ') {
              event.preventDefault();
              handleAiButtonClick();
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
    toggleMaximize,
    toggleMinimize,
    handleAiButtonClick,
    handleSendMessage
  ]);

  return (
    <div
      tabIndex={-1}
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 right-0 top-0 z-10 origin-bottom content-end transition-all duration-300',
        !isMaximized || isMinimized ? 'left-4' : ''
      )}
      style={{
        willChange: 'left'
      }}
    >
      <Card
        className={cn(
          'ease-bounce-in-out pointer-events-auto flex flex-col border border-border/60 bg-card dark:bg-background',
          'h-[57vh] max-h-[570px] min-h-[500px] w-full min-w-[540px] max-w-[600px] transition-all duration-300',
          isMaximized && 'h-full min-h-full min-w-full max-w-full',
          // Newton elevation: still clearly floating but less chunky than
          // the prior 30% black drop. Refined edge keeps the popout
          // distinct from the document behind it without screaming.
          isMinimized
            ? 'shadow-md'
            : 'shadow-xl shadow-black/10 dark:shadow-black/40',
          !isMaximized || isMinimized ? 'rounded-t-lg' : 'rounded-none border-0 shadow-none',

          // isClosing ? 'duration-0' : 'duration-400',
          isMinimized ? 'max-h-12 min-h-12 min-w-80 max-w-80' : '',
          // isVisible && !isClosing ? '' : 'h-0 max-h-0 min-h-0',
          isVisible && !isClosing ? '' : 'translate-y-4 opacity-0',
          className
        )}
        style={{
          willChange: 'width, height, max-height, max-width'
        }}
      >
        <CardHeader className={cn('justify-center space-y-0 p-0')}>
          <div
            onClick={() => isMinimized && toggleMinimize()}
            className={cn(
              'flex items-center gap-0.5 border-b border-border/40 p-2 transition-all',
              isMinimized && 'border-b-0',
              isMaximized && 'mt-1',
              isElectron && isMaximized && sidebarCollapsed && 'pl-28'
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={'ghost'} sizeVariant={'sm'} typeVariant={'icon'}>
                  <MonoIcon type={'X'} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleCloseButton()}>
                  <MonoIcon type={'X'} className="mr-2 h-4 w-4" />
                  <span>{t('tooltip.close')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDiscard}>
                  <MonoIcon type={'Trash'} className="mr-2 h-4 w-4" />
                  <span>{t('tooltip.discard')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!isMinimized ? (
              <>
                <Button
                  onClick={toggleMinimize}
                  tooltip={t('tooltip.minimize')}
                  variant={'ghost'}
                  shortcut={'MOD+SHIFT+M'}
                  sizeVariant={'sm'}
                  typeVariant={'icon'}
                >
                  <MonoIcon type={'Minus'} />
                </Button>
                <Button
                  onClick={toggleMaximize}
                  tooltip={t('tooltip.maximize')}
                  variant={'ghost'}
                  shortcut={'MOD+SHIFT+F'}
                  sizeVariant={'sm'}
                  typeVariant={'icon'}
                >
                  {isMaximized ? <MonoIcon type={'Minimize'} /> : <MonoIcon type={'Maximize'} />}
                </Button>
                <div className="ml-auto flex items-center">
                  <div className="mr-2">{renderDraftStatus}</div>
                </div>
              </>
            ) : (
              <div className="mb-0.5 ml-1 line-clamp-1 text-sm font-medium">
                {composeDraft.subject.length > 0 ? composeDraft.subject : '(No subject)'}
              </div>
            )}
          </div>
          {!isMinimized && (
            <ComposeCardHeader
              composeDraft={composeDraft}
              handleInputChange={handleInputChange}
              onKeyDown={(event) => {
                if (event.metaKey && event.shiftKey && event.code === 'KeyF') {
                  event.preventDefault();
                  toggleMaximize();
                }
                if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
                  event.preventDefault();
                  toggleMinimize();
                }
                if (event.metaKey && event.code === 'KeyJ') {
                  event.preventDefault();
                  handleAiButtonClick();
                }
              }}
            />
          )}
        </CardHeader>
        {!isMinimized && (
          <>
            <CardContent className="no-drag flex-1 overflow-y-scroll p-0">
              <div className="flex h-full flex-col">
                <div className="border-b border-border/40 px-4 pb-3 pt-3">
                  <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {replyMessage
                      ? 'Replying'
                      : historyMessage
                        ? 'Forwarding'
                        : 'New message'}
                  </p>
                  <div className="relative">
                    <Input
                      ref={subjectRef}
                      variant="transparent"
                      placeholder={t('text_editor.placeholder.subject')}
                      className={cn(
                        'h-auto border-none px-0 py-0 text-[18px] font-medium tracking-tight text-foreground placeholder:text-muted-foreground/60',
                        composeDraft.body && composeDraft.body.trim().length > 0 ? 'pr-10' : ''
                      )}
                      value={composeDraft.subject}
                      onChange={(e) => handleInputChange('subject', e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          editorRef.current?.focus();
                        }

                        if (event.metaKey && event.shiftKey && event.code === 'KeyF') {
                          event.preventDefault();
                          toggleMaximize();
                        }
                        if (event.metaKey && event.shiftKey && event.code === 'KeyM') {
                          event.preventDefault();
                          toggleMinimize();
                        }
                        if (event.metaKey && event.code === 'KeyJ') {
                          event.preventDefault();
                          handleAiButtonClick();
                        }

                        if (event.metaKey && event.code === 'Enter') {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    {composeDraft.body &&
                      composeDraft.body.trim().length > 0 &&
                      !replyMessage &&
                      !historyMessage && (
                        <Button
                          onClick={handleGenerateSubject}
                          disabled={isGeneratingSubject}
                          className="absolute right-0 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                          variant="ghost"
                          typeVariant="icon"
                          tooltip={
                            isGeneratingSubject
                              ? t('compose_card.subject_generation.generating')
                              : t('compose_card.subject_generation.tooltip')
                          }
                        >
                          {isGeneratingSubject ? (
                            <Loader className="h-4 w-4" />
                          ) : (
                            // AI affordance — amber secondary-accent. Red
                            // accent stays reserved for primary actions
                            // (send, unread, sign-in).
                            <MonoIcon
                              type="Sparkles"
                              className="text-[hsl(var(--secondary-accent))]"
                            />
                          )}
                        </Button>
                      )}
                  </div>
                </div>
                <div className="relative flex-1 pb-4">
                  {renderEditor}
                  <div className="px-4 text-sm">
                    <SignatureSwitcher draft={composeDraft} onSignatureChange={onSignatureChange} />
                  </div>

                  {aiComposeTransitions((style, item) =>
                    item ? (
                      <animated.div
                        style={style}
                        className="absolute bottom-8 left-0 right-0 flex justify-center"
                      >
                        <AIComposeCard
                          onSave={onAcceptAiResponse}
                          onClose={() => setIsAiComposeOpen(false)}
                          uid={getUidFromEmail(composeDraft.from) as string}
                          draft={composeDraft}
                        />
                      </animated.div>
                    ) : null
                  )}
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
                  <div className="mt-4 grid auto-cols-max grid-flow-row gap-3 px-4 text-center">
                    {memoizedAttachments}
                  </div>
                </div>
              </div>
            </CardContent>
            <ComposeCardFooter
              draft={composeDraft}
              draftSaveStatus={draftSaveStatus}
              handleSendMessage={handleSendMessage}
              handleAiButtonClick={handleAiButtonClick}
              handleFileChange={handleFileChange}
              trackingEnabled={trackingEnabled}
              onTrackingChange={handleTrackingChange}
              sendDisabled={
                composeDraft.to.length === 0 || !composeDraft.from || draftSaveStatus === 'LOADING'
              }
              onFromChange={onFromChange}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default GlobalComposeCard;
