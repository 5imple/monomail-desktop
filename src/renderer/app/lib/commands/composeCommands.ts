import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { CommandType } from '@/renderer/app/types';
import {
  MonoCommand,
  MessageCommandArgs,
  ComposeCommandArgs,
  PinContactCommandArgs,
  ThreadCommandArgs
} from './types';
import { startEmailAccountLink } from '@/renderer/app/lib/accountLinking';
import { isBackendConfigured } from '@/main/api/apiClient';
import { toast } from 'sonner';
import {
  buildReplyAllRecipients,
  buildReplyRecipients,
  replySubject
} from '@/renderer/app/lib/replyRecipients';

interface ComposeCommandDependencies {
  t: (key: string, options?: any) => string;
  dialogState: any;
  getAccountEmailById: (accountId?: string) => string;
  setGlobalDraftWindows: (drafts: MonoDraft[]) => void;
  openDialog: (dialog: any, options?: any) => void;
  globalSearchQuery: string;
  selectedThreads: string[];
  activeThreadId: string | null;
  groupThreadsByAccount: (threadIds: string[]) => Record<string, string[]>;
  removeDraft: (accountId: string, draftId: string) => Promise<void>;
  accounts: Array<{ email: string }>;
  threadsMap: Record<string, any>;
}

export const createComposeCommands = (
  deps: ComposeCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const {
    t,
    dialogState,
    getAccountEmailById,
    setGlobalDraftWindows,
    openDialog,
    globalSearchQuery,
    selectedThreads,
    activeThreadId,
    groupThreadsByAccount,
    removeDraft,
    accounts,
    threadsMap
  } = deps;

  const ownEmails = () => new Set(accounts.map((account) => account.email.toLowerCase()));

  // The command palette runs Reply/Forward with no args. Resolve the open
  // thread's latest message the way the R/F hotkeys do, instead of silently
  // doing nothing.
  const resolveMessageArgs = (
    args: MessageCommandArgs | undefined,
    preferOthers: boolean
  ): MessageCommandArgs | undefined => {
    if (args?.message) return args;
    const threadId = selectedThreads[0] ?? activeThreadId;
    const thread = threadId ? threadsMap[threadId] : undefined;
    if (!thread) return undefined;
    const messages = (thread.items ?? []).filter(
      (item: { type: string }) => item.type === 'message'
    ) as MonoMessage[];
    const own = ownEmails();
    const fromOthers = messages.filter((m) => !own.has(m.from.email.toLowerCase()));
    const pool = preferOthers && fromOthers.length > 0 ? fromOthers : messages;
    const message = pool[pool.length - 1];
    return message ? { message, accountId: thread.accountId } : undefined;
  };

  return {
    // Pins and saved searches are stored on the backend; without one their
    // keys would open a page that can only end in "Failed to…". The palette
    // hides the commands too (CommandPalette's backendOnlyCommands).
    PIN_CONTACT: {
      scope: 'GLOBAL',
      title: t('command.pin_contact'),
      icon: 'UserPlus',
      hotkeys: isBackendConfigured() ? ['MOD+E', 'MOD+CTRL+E'] : undefined,
      action: (args?: PinContactCommandArgs) => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', {
          pages: ['PIN_CONTACT'],
          pinContact: args?.pinContact ?? ''
        });
        return;
      }
    },

    COMPOSE_NEW_MESSAGE: {
      scope: 'GLOBAL',
      title: t('command.compose_new_message'),
      icon: 'Edit',
      hotkeys: ['C', 'MOD+N'],
      action: (args?: ComposeCommandArgs) => {
        const accountEmail = getAccountEmailById(args?.draft?.from);
        if (!accountEmail) {
          toast(t('toast.compose.connect_gmail_first'), {
            action: {
              label: t('toast.compose.connect_gmail'),
              onClick: () => {
                void startEmailAccountLink('gmail');
              }
            }
          });
          return;
        }

        const draft = args?.draft ?? new MonoDraft({ from: accountEmail });
        setGlobalDraftWindows([draft]);
      }
    },

    COMPOSE_REPLY_MESSAGE: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.compose_reply_message'),
      hotkeys: ['R'],
      icon: 'Reply',
      action: (rawArgs?: MessageCommandArgs) => {
        const args = resolveMessageArgs(rawArgs, true);
        const item = args?.message;
        if (!item) return;

        // Use the message's accountId if available
        const accountId = args?.accountId;
        const accountEmail = getAccountEmailById(accountId);

        if (!accountEmail) return;

        // Plain Reply answers the sender only — copying Cc/Bcc made it behave
        // like Reply All (and re-exposed Bcc recipients of your own mail).
        // Replying to your own message goes to its original recipients.
        const to = buildReplyRecipients(item, ownEmails());

        const draft = new MonoDraft({
          from: accountEmail,
          messageId: item.id,
          threadId: item.threadId,
          to,
          subject: item.subject.toLowerCase().startsWith('re: ')
            ? item.subject
            : `Re: ${item.subject}`
        });
        setGlobalDraftWindows([draft]);
      }
    },

    // Enter in the reader (see useRegisterHotkeys): everyone on the latest
    // message — sender + To on To, Cc on Cc, minus your own addresses.
    COMPOSE_REPLY_ALL_MESSAGE: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.compose_reply_all_message'),
      // A is the Superhuman / Gmail key; Enter works in the reader.
      hotkeys: ['Enter', 'A'],
      icon: 'Reply',
      action: (rawArgs?: MessageCommandArgs) => {
        const args = resolveMessageArgs(rawArgs, false);
        const item = args?.message;
        if (!item) return;

        const accountEmail = getAccountEmailById(args?.accountId);
        if (!accountEmail) return;

        const own = ownEmails();
        own.add(accountEmail.toLowerCase());
        const { to, cc } = buildReplyAllRecipients(item, own);

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
      }
    },

    COMPOSE_FORWARD_MESSAGE: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.compose_forward_message'),
      hotkeys: ['F'],
      icon: 'Forward',
      action: (rawArgs?: MessageCommandArgs) => {
        const args = resolveMessageArgs(rawArgs, false);
        const item = args?.message;
        if (!item) return;

        // Use the message's accountId if available
        const accountId = args?.accountId;
        const accountEmail = getAccountEmailById(accountId);
        if (!accountEmail) return;

        const draft = new MonoDraft({
          from: accountEmail,
          messageId: item.id,
          threadId: item.threadId,
          // Outlook's "FW:" counts too (it became "Fwd: FW: …").
          subject: /^fwd?:/i.test(item.subject.trim()) ? item.subject : `Fwd: ${item.subject}`
        });
        setGlobalDraftWindows([draft]);
      }
    },

    DISCARD_DRAFT: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.discard_draft'),
      icon: 'Trash',
      action: async (args?: ThreadCommandArgs) => {
        const threadIds =
          args?.threadIds ??
          (selectedThreads.length > 0 ? selectedThreads : activeThreadId ? [activeThreadId] : []);
        if (threadIds.length === 0) return;

        const threadsByAccount = groupThreadsByAccount(threadIds);
        await Promise.all(
          Object.entries(threadsByAccount).flatMap(([accountId, ids]) =>
            ids.map((threadId) => removeDraft(accountId, threadId))
          )
        );
      }
    },

    // Sidebar commands
    SIDEBAR_FAVORITE_ADD: {
      scope: 'SIDEBAR',
      title: t('command.sidebar_favorite_add'),
      hotkeys: isBackendConfigured() ? ['MOD+CTRL+D', 'MOD+D'] : undefined,
      icon: 'Plus',
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', {
          pages: ['SEARCH', 'BOOKMARK_NAME'],
          searchQuery: globalSearchQuery
        });
        return;
      }
    }
  };
};
