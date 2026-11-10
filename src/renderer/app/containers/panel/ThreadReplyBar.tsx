import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { generateUUID } from '@/main/utils';
import {
  ESCAPE_OWNER_SELECTOR,
  findUnfilledVariables
} from '@/renderer/app/components/card/compose/composeLifecycle';
import { defaultSignatureId } from '@/renderer/app/components/card/compose/defaultSignature';
import { loadReplyOriginal } from '@/renderer/app/components/card/compose/loadReplyOriginal';
import { prewarmEmailInliner } from '@/renderer/app/components/card/compose/prepareOutgoingDraft';
import { useSendComposedDraft } from '@/renderer/app/components/card/compose/useSendComposedDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import TextEditor, { TextEditorHandle } from '@/renderer/app/containers/editor/TextEditor';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { hasModKey } from '@/renderer/app/lib/platform';
import { quickReplyControl } from '@/renderer/app/lib/quickReplyControl';
import { recipientSummary } from '@/renderer/app/lib/recipientSummary';
import {
  buildReplyAllRecipients,
  buildReplyRecipients,
  replySubject,
  replyTargets
} from '@/renderer/app/lib/replyRecipients';
import { senderFirstName } from '@/renderer/app/lib/senderFirstName';
import { cn } from '@/renderer/app/lib/utils';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface ThreadReplyBarProps {
  thread: MonoThread;
  className?: string;
}

const SIDE_BUTTON_CLASS =
  'h-10 shrink-0 gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground';

/**
 * The reply box under the last message, where the eye lands after reading.
 *
 * "Reply to Jane…" (or R) opens a quick reply right here: write, ⌘↵ sends,
 * Esc folds it away (the text stays). It sends exactly as the compose window
 * does (useSendComposedDraft: quote, signature, undo countdown, archive on
 * send). "Open in full editor" moves what's written to the compose window,
 * for attachments, Cc / Bcc or formatting. Text left here when the email is
 * closed is kept as a draft.
 *
 * Reply all and Forward beside it open the compose window. Same targets as
 * the R / Enter / F keys: Reply answers the latest message from someone
 * else, the other two take the newest message.
 */
const ThreadReplyBar: FC<ThreadReplyBarProps> = ({ thread, className }) => {
  const { t } = useTranslation();
  const { accounts, preference, getUidFromEmail } = useAuth();
  const { getDefaultSignature } = useSignatureAtom();
  const { updateDraft } = useDraftAtom();
  const executeCommand = useExecuteCommand();
  const sendComposed = useSendComposedDraft();

  const ownEmails = useMemo(() => accounts.map((account) => account.email), [accounts]);
  const live = useMemo(
    () =>
      replyTargets(
        thread.items.filter((item) => item.type === 'message') as MonoMessage[],
        ownEmails
      ),
    [thread, ownEmails]
  );
  // Who a reply goes to is fixed once writing starts: a message arriving
  // meanwhile mustn't readdress it. Released when the text goes (sent,
  // discarded, handed to the full editor).
  const [pinned, setPinned] = useState<{
    replyTarget: MonoMessage | null;
    latest: MonoMessage | null;
  } | null>(null);
  const replyTarget = pinned ? pinned.replyTarget : live.replyTarget;
  const latest = pinned ? pinned.latest : live.latest;
  const { fromOthers } = live;
  const fromEmail =
    accounts.find((account) => account.uid === thread.accountId)?.email ?? accounts[0]?.email ?? '';

  const [open, setOpen] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  // Text kept while folded (the pill says so).
  const [hasText, setHasText] = useState(false);
  // A new editor (with htmlRef's text) after a discard is undone.
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<TextEditorHandle | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef('');
  const textRef = useRef('');
  // One draft id for this reply: the draft it's saved as, sent as, or handed
  // to the compose window as.
  const draftIdRef = useRef(generateUUID());
  // Sent, handed off or saved: nothing left to keep when the bar goes away.
  const settledRef = useRef(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const originalsRef = useRef(new Map<string, Promise<MonoMessage | null>>());

  // Reply all answers the newest message, Reply the latest from someone else.
  const answered = replyAll ? latest : replyTarget;
  const recipients = useMemo(() => {
    if (replyAll && latest) return buildReplyAllRecipients(latest, [...ownEmails, fromEmail]);
    return { to: replyTarget ? buildReplyRecipients(replyTarget, ownEmails) : [], cc: [] };
  }, [replyAll, latest, replyTarget, ownEmails, fromEmail]);
  const replyAllAddsPeople = useMemo(() => {
    if (!latest || !replyTarget) return false;
    const all = buildReplyAllRecipients(latest, [...ownEmails, fromEmail]);
    const one = buildReplyRecipients(replyTarget, ownEmails);
    return all.to.length + all.cc.length > one.length;
  }, [latest, replyTarget, ownEmails, fromEmail]);

  // Names for the "To" line, from everyone the conversation shows.
  const recipientLine = useMemo(() => {
    const names = new Map<string, string | undefined>();
    for (const item of thread.items) {
      if (item.type !== 'message') continue;
      const message = item as MonoMessage;
      for (const person of [message.from, ...(message.to ?? []), ...(message.cc ?? [])]) {
        const key = person?.email?.trim().toLowerCase();
        if (key && person.name && !names.get(key)) names.set(key, person.name);
      }
    }
    const withName = (email: string) => ({ email, name: names.get(email.trim().toLowerCase()) });
    return recipientSummary(recipients.to.map(withName), recipients.cc.map(withName), [], {
      ownEmails,
      meLabel: t('message_card.me', { defaultValue: 'me' })
    });
  }, [thread, recipients, ownEmails, t]);

  const originalFor = useCallback(
    (messageId: string): Promise<MonoMessage | null> => {
      let original = originalsRef.current.get(messageId);
      if (!original) {
        const uid = getUidFromEmail(fromEmail);
        original = uid
          ? loadReplyOriginal(uid, messageId).catch((error) => {
              console.error('[quick reply] could not load the original message:', error);
              return null;
            })
          : Promise.resolve(null);
        originalsRef.current.set(messageId, original);
      }
      return original;
    },
    [getUidFromEmail, fromEmail]
  );

  const buildDraft = useCallback((): MonoDraft | null => {
    if (!answered || !fromEmail) return null;
    const subject = replySubject(answered.subject ?? '');
    return new MonoDraft({
      id: draftIdRef.current,
      from: fromEmail,
      messageId: answered.id,
      threadId: answered.threadId,
      to: recipients.to,
      cc: recipients.cc,
      subject,
      body: htmlRef.current,
      signatureId:
        defaultSignatureId(
          { from: fromEmail, subject, messageId: answered.id },
          preference.signature,
          getUidFromEmail,
          getDefaultSignature
        ) ?? ''
    });
  }, [answered, fromEmail, recipients, preference.signature, getUidFromEmail, getDefaultSignature]);

  const clearText = useCallback(() => {
    htmlRef.current = '';
    textRef.current = '';
    setHasText(false);
    setPinned(null);
  }, []);

  // Text left behind when the email closes (or the app quits) is kept as a
  // draft, like the compose window does: it shows under the message, and
  // Edit continues it in the compose window.
  const keepAsDraftRef = useRef<() => void>(() => undefined);
  keepAsDraftRef.current = () => {
    if (settledRef.current || !textRef.current.trim()) return;
    const draft = buildDraft();
    const uid = draft ? getUidFromEmail(draft.from) : undefined;
    if (!draft || !uid) return;
    settledRef.current = true;
    const reopen = new MonoDraft(draft.toPlainObject());
    void updateDraft(uid, draft, true, true)
      .then(() =>
        toast(t('toast.compose.draft_saved'), {
          action: {
            label: t('toast.compose.open_draft'),
            onClick: () => void executeCommand('COMPOSE_NEW_MESSAGE', { draft: reopen })
          }
        })
      )
      .catch((error) => console.error('[quick reply] could not save the draft:', error));
  };
  useEffect(() => {
    mountedRef.current = true;
    const onPageHide = () => keepAsDraftRef.current();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', onPageHide);
      keepAsDraftRef.current();
    };
  }, []);

  // Opening: the quote and the outgoing-mail styling get ready meanwhile, and
  // the box comes into view.
  useEffect(() => {
    if (open && !pinned) setPinned({ replyTarget: live.replyTarget, latest: live.latest });
  }, [open, pinned, live]);

  useEffect(() => {
    if (!open) return;
    prewarmEmailInliner();
    if (answered) void originalFor(answered.id);
    requestAnimationFrame(() =>
      boxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    );
  }, [open, answered, originalFor]);

  // R opens it (useRegisterHotkeys): focus when it's already open.
  useEffect(() => {
    const openHere: NonNullable<typeof quickReplyControl.open> = (threadId, options) => {
      if (threadId !== thread.id || !replyTarget) return false;
      // Reply all (Enter / A) continues a reply being written here; with
      // nothing written it's the compose window's, as before.
      if (options?.onlyIfWriting && !open && !textRef.current.trim()) return false;
      if (options?.replyAll) setReplyAll(true);
      if (open) editorRef.current?.focus('end');
      else setOpen(true);
      return true;
    };
    quickReplyControl.open = openHere;
    return () => {
      if (quickReplyControl.open === openHere) quickReplyControl.open = null;
    };
  }, [thread.id, replyTarget, open]);

  const fold = useCallback(() => {
    setHasText(!!textRef.current.trim());
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const send = useCallback(
    async (allowUnfilled = false) => {
      if (sendingRef.current) return;
      const editor = editorRef.current;
      const text = editor?.getText() ?? textRef.current;
      if (!text.trim()) {
        editor?.focus('end');
        return;
      }
      const account = accounts.find((candidate) => candidate.email === fromEmail);
      if (account?.isExpired) {
        toast.error(t('toast.error.account_expired'));
        return;
      }
      if (recipients.to.length + recipients.cc.length === 0) {
        toast(t('compose_card.footer.send_disabled.no_recipients'));
        return;
      }
      // Template merge fields left as {first_name}: ask before they go out.
      if (!allowUnfilled) {
        const unfilled = findUnfilledVariables(text);
        if (unfilled.length > 0) {
          toast(t('compose_card.unfilled_variables', { names: unfilled.join(', ') }), {
            id: 'compose-send-blocked',
            action: { label: t('compose_card.send_anyway'), onClick: () => void send(true) }
          });
          return;
        }
      }
      htmlRef.current = editor?.getHTML() ?? htmlRef.current;
      const written = buildDraft();
      if (!written || !answered) return;
      sendingRef.current = true;
      settledRef.current = true;
      const started = await sendComposed({
        written,
        replyMessage: originalFor(answered.id),
        trackingEnabled: preference.compose?.trackReadReceipts ?? false,
        onClose: () => {
          clearText();
          setOpen(false);
        }
      });
      sendingRef.current = false;
      // Ready for another reply, should the bar stay (outside the Inbox).
      settledRef.current = false;
      if (started) draftIdRef.current = generateUUID();
    },
    [
      accounts,
      fromEmail,
      recipients,
      t,
      buildDraft,
      answered,
      sendComposed,
      originalFor,
      preference.compose?.trackReadReceipts,
      clearText
    ]
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  // To the compose window with what's written (saved first, so closing the
  // window untouched keeps it), for attachments, Cc / Bcc or formatting.
  const openFullEditor = useCallback(async () => {
    htmlRef.current = editorRef.current?.getHTML() ?? htmlRef.current;
    const written = buildDraft();
    if (!written) return;
    const hasWords = !!(editorRef.current?.getText() ?? textRef.current).trim();
    settledRef.current = true;
    const uid = getUidFromEmail(written.from);
    if (hasWords && uid) {
      try {
        await updateDraft(uid, new MonoDraft(written.toPlainObject()), true, true);
      } catch (error) {
        console.error('[quick reply] could not save before opening the editor:', error);
      }
    }
    if (mountedRef.current) {
      clearText();
      setOpen(false);
      settledRef.current = false;
      draftIdRef.current = generateUUID();
    }
    void executeCommand('COMPOSE_NEW_MESSAGE', { draft: written });
  }, [buildDraft, getUidFromEmail, updateDraft, clearText, executeCommand]);

  const discard = useCallback(() => {
    const html = htmlRef.current;
    const text = textRef.current;
    const kept = buildDraft();
    clearText();
    setOpen(false);
    setEditorKey((key) => key + 1);
    if (!text.trim()) return;
    toast(t('toast.compose.discarded'), {
      action: {
        label: t('toast.undo'),
        onClick: () => {
          if (mountedRef.current) {
            htmlRef.current = html;
            textRef.current = text;
            setEditorKey((key) => key + 1);
            setOpen(true);
          } else if (kept) {
            // Saved first, so closing the window untouched keeps it.
            void (async () => {
              const uid = getUidFromEmail(kept.from);
              if (uid) {
                try {
                  await updateDraft(uid, new MonoDraft(kept.toPlainObject()), true, true);
                } catch (error) {
                  console.error('[quick reply] could not save the restored reply:', error);
                }
              }
              void executeCommand('COMPOSE_NEW_MESSAGE', { draft: kept });
            })();
          }
        }
      }
    });
  }, [buildDraft, clearText, executeCommand, getUidFromEmail, updateDraft, t]);

  const handleEditorKeyDown = useCallback(
    (_view: unknown, event: KeyboardEvent) => {
      if (event.key === 'Enter' && hasModKey(event)) {
        event.preventDefault();
        void sendRef.current();
        return true;
      }
      return false;
    },
    []
  );

  // Esc folds the box, from the text or any button in it. Decided as the key
  // leaves the box, once the editor has had it: the slash menu takes its own
  // Esc first (ProseMirror cancels the key). It used to wait until the key
  // had been everywhere, so any listener that cancelled Esc on the way (a
  // link popover's leftover one, for instance) kept the box open.
  const handleBoxKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) {
        return;
      }
      if (document.querySelector(ESCAPE_OWNER_SELECTOR)) return;
      event.preventDefault();
      event.stopPropagation();
      fold();
    },
    [fold]
  );

  // The pill fades back in after a fold, not each time an email opens.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (open) setFolded(true);
  }, [open]);

  if (!latest) return null;

  const run = (
    command: 'COMPOSE_REPLY_ALL_MESSAGE' | 'COMPOSE_FORWARD_MESSAGE',
    message: MonoMessage | null
  ) => {
    if (!message) return;
    executeCommand(command, { message, accountId: thread.accountId });
  };

  const senderName = fromOthers ? senderFirstName(replyTarget?.from) : '';
  const replyPrompt = senderName
    ? t('message_card.reply_to_name', { defaultValue: 'Reply to {{name}}…', name: senderName })
    : t('message_card.reply_ellipsis', { defaultValue: 'Reply…' });

  if (open && answered) {
    return (
      <div
        ref={boxRef}
        data-quick-reply
        onKeyDown={handleBoxKeyDown}
        className={cn(
          'overflow-hidden rounded-2xl border border-border bg-background shadow-sm focus-within:border-foreground/20',
          // Opens out of the Reply pill: rises a few pixels, grows from its
          // bottom edge and fades in, quick enough to type into at once.
          'origin-bottom animate-quick-reply-open motion-reduce:animate-none',
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-2 pl-4 pr-2 pt-2.5 text-[13px] text-muted-foreground">
          <MonoIcon type={replyAll ? 'reply_all' : 'Reply'} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate" title={recipientLine.full}>
            {t('message_card.quick_reply_to', {
              defaultValue: 'To {{names}}',
              names: recipientLine.text
            })}
          </span>
          {replyAllAddsPeople && (
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-selection hover:bg-foreground/5"
              onClick={() => {
                setReplyAll((value) => !value);
                editorRef.current?.focus('end');
              }}
            >
              {replyAll
                ? t('message_card.quick_reply_one', {
                    defaultValue: 'Only {{name}}',
                    name: senderFirstName(replyTarget?.from) || replyTarget?.from?.email
                  })
                : t('message_card.reply_all', { defaultValue: 'Reply all' })}
            </button>
          )}
          <Button
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            tooltip={t('message_card.open_full_editor', {
              defaultValue: 'Open in full editor'
            })}
            onClick={() => void openFullEditor()}
          >
            <MonoIcon type="Maximize" className="h-3.5 w-3.5" />
          </Button>
        </div>
        <TextEditor
          key={editorKey}
          ref={editorRef}
          value={htmlRef.current}
          autofocus="end"
          className="max-h-[50vh] min-h-[88px] overflow-y-auto px-4 pb-2 pt-2"
          onChange={(html) => {
            htmlRef.current = html;
            textRef.current = editorRef.current?.getText() ?? '';
          }}
          onEditorKeyDown={handleEditorKeyDown}
        />
        {/* The toolbar: a light divider under the text, Send with its keys
            inside it, Discard beside it, and the Esc hint as a key chip. */}
        <div className="flex items-center gap-1 border-t border-border/60 px-2.5 py-2">
          <Button
            sizeVariant="sm"
            className={cn(
              // Flat foreground pill (the default variant's gradient read as a
              // heavy black slab here); inverted in dark themes by the tokens.
              'h-8 gap-2.5 rounded-full bg-foreground bg-none pl-3.5 pr-1.5 text-[13px] font-medium text-background shadow-sm transition-colors',
              'hover:bg-foreground/90 dark:bg-foreground dark:hover:bg-foreground/90'
            )}
            onClick={() => void send()}
          >
            {t('message_card.send', { defaultValue: 'Send' })}
            <ShortcutKeyboard
              variant="flat"
              className="gap-px"
              keyboardClassName="h-5 min-w-5 rounded-full bg-background/15 px-1.5 font-sans text-[11px] text-background/80"
              shortcut="MOD+ENTER"
            />
          </Button>
          <Button
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            tooltip={t('message_card.discard_reply', { defaultValue: 'Discard' })}
            aria-label={t('message_card.discard_reply', { defaultValue: 'Discard' })}
            onClick={discard}
          >
            <MonoIcon type="Trash" className="h-4 w-4" />
          </Button>
          <span className="ml-auto hidden items-center gap-1.5 pr-1.5 text-[12px] text-muted-foreground sm:inline-flex">
            <ShortcutKeyboard sizeVariant="sm" className="font-sans" shortcut="ESC" />
            {t('message_card.quick_reply_hint_close', { defaultValue: 'to close' })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        folded && 'duration-150 animate-in fade-in-0 motion-reduce:animate-none',
        className
      )}
    >
      <Button
        variant="outline"
        sizeVariant="sm"
        className="h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-full px-4 text-[13px] font-normal text-muted-foreground shadow-sm hover:text-foreground"
        tooltip={t('message_card.reply')}
        shortcut="R"
        onClick={() => setOpen(true)}
      >
        <MonoIcon type="Reply" className="h-4 w-4 shrink-0" />
        <span className="truncate">{replyPrompt}</span>
        {hasText && (
          <span className="ml-auto shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {t('message_card.quick_reply_draft', { defaultValue: 'Draft' })}
          </span>
        )}
      </Button>
      <Button
        variant="ghost"
        sizeVariant="sm"
        className={SIDE_BUTTON_CLASS}
        tooltip={t('message_card.reply_all', { defaultValue: 'Reply all' })}
        shortcut="Enter"
        onClick={() => {
          // A reply being written here continues as Reply all, rather than a
          // second draft in the compose window.
          if (hasText) {
            setReplyAll(true);
            setOpen(true);
          } else run('COMPOSE_REPLY_ALL_MESSAGE', latest);
        }}
      >
        <MonoIcon type="reply_all" className="h-4 w-4" />
        <span className="hidden sm:inline">
          {t('message_card.reply_all', { defaultValue: 'Reply all' })}
        </span>
      </Button>
      <Button
        variant="ghost"
        sizeVariant="sm"
        className={SIDE_BUTTON_CLASS}
        tooltip={t('message_card.forward')}
        shortcut="F"
        onClick={() => run('COMPOSE_FORWARD_MESSAGE', latest)}
      >
        <MonoIcon type="Forward" className="h-4 w-4" />
        <span className="hidden sm:inline">{t('message_card.forward')}</span>
      </Button>
    </div>
  );
};

export default ThreadReplyBar;
