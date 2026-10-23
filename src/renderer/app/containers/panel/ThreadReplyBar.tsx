import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface ThreadReplyBarProps {
  thread: MonoThread;
  className?: string;
}

const BUTTON_CLASS = 'h-9 gap-2 rounded-full px-4 text-[13px] font-medium';

/**
 * Reply / Reply all / Forward under the last message, where the eye lands
 * after reading. Same targets as the R / Enter / F keys and the toolbar:
 * Reply answers the latest message from someone else, the other two take the
 * newest message.
 */
const ThreadReplyBar: FC<ThreadReplyBarProps> = ({ thread, className }) => {
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const executeCommand = useExecuteCommand();

  const { replyTarget, latest } = useMemo(() => {
    const messages = thread.items.filter((item) => item.type === 'message') as MonoMessage[];
    const own = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
    const fromOthers = messages.filter(
      (message) => !own.has(message.from?.email?.trim().toLowerCase())
    );
    const pool = fromOthers.length > 0 ? fromOthers : messages;
    return {
      replyTarget: pool[pool.length - 1] ?? null,
      latest: messages[messages.length - 1] ?? null
    };
  }, [thread, accounts]);

  if (!latest) return null;

  const run = (
    command: 'COMPOSE_REPLY_MESSAGE' | 'COMPOSE_REPLY_ALL_MESSAGE' | 'COMPOSE_FORWARD_MESSAGE',
    message: MonoMessage | null
  ) => {
    if (!message) return;
    executeCommand(command, { message, accountId: thread.accountId });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        variant="outline"
        sizeVariant="sm"
        className={BUTTON_CLASS}
        tooltip={t('message_card.reply')}
        shortcut="R"
        onClick={() => run('COMPOSE_REPLY_MESSAGE', replyTarget)}
      >
        <MonoIcon type="Reply" className="h-4 w-4 text-muted-foreground" />
        {t('message_card.reply')}
      </Button>
      <Button
        variant="outline"
        sizeVariant="sm"
        className={BUTTON_CLASS}
        tooltip={t('message_card.reply_all', { defaultValue: 'Reply all' })}
        shortcut="Enter"
        onClick={() => run('COMPOSE_REPLY_ALL_MESSAGE', latest)}
      >
        <MonoIcon type="reply_all" className="h-4 w-4 text-muted-foreground" />
        {t('message_card.reply_all', { defaultValue: 'Reply all' })}
      </Button>
      <Button
        variant="outline"
        sizeVariant="sm"
        className={BUTTON_CLASS}
        tooltip={t('message_card.forward')}
        shortcut="F"
        onClick={() => run('COMPOSE_FORWARD_MESSAGE', latest)}
      >
        <MonoIcon type="Forward" className="h-4 w-4 text-muted-foreground" />
        {t('message_card.forward')}
      </Button>
    </div>
  );
};

export default ThreadReplyBar;
