import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface ThreadLabelBadgesProps {
  thread: MonoThread;
  className?: string;
}

/**
 * The conversation's labels (and "In Trash"), beside its subject: click one to
 * change labels, × to remove it (with Undo). They sat in the reader's toolbar,
 * where they competed with the actions for width.
 */
const ThreadLabelBadges: FC<ThreadLabelBadgesProps> = ({ thread, className }) => {
  const { t } = useTranslation();
  const { openDialog } = useDialogs();
  const { trackEvent } = useUserTrackingData();
  const { labelsMapByAccount } = useLabelAtom();
  const { removeLabelFromThread, addLabelToThread } = useThreadLabelAtom();
  const threadLabels = labelsMapByAccount[thread.accountId] ?? {};

  // Keyed on the label list itself: label edits mutate thread.labelIds on the
  // same thread object, so memoizing on [thread] left removed/added badges stale.
  const labelIdsKey = thread.labelIds.join(',');
  const labelIds = useMemo(
    () => [...new Set(labelIdsKey.split(',').filter((label) => label.includes('Label_')))],
    [labelIdsKey]
  );
  const inTrash = thread.labelIds.includes('TRASH');
  const shown = labelIds.filter((id) => threadLabels[id]?.name);
  if (shown.length === 0 && !inTrash) return null;

  const removeLabel = async (labelId: string) => {
    const { accountId, id: threadId } = thread;
    try {
      await removeLabelFromThread(accountId, [threadId], labelId);
    } catch (error) {
      console.error('Failed to remove label:', error);
      toast.error(t('toast.error.label_remove'));
      return;
    }
    trackEvent('removed_label', { thread_id: threadId });
    const labelName = threadLabels[labelId]?.name?.replace('Mono/', '');
    toast(
      t('header.display.label_removed', {
        defaultValue: 'Removed label {{name}}',
        name: labelName ?? ''
      }),
      {
        action: {
          label: t('toast.undo', { defaultValue: 'Undo' }),
          onClick: () => {
            addLabelToThread(accountId, [threadId], labelId).catch((error) => {
              console.error('Failed to re-add label:', error);
              toast.error(t('toast.error.label_remove'));
            });
          }
        }
      }
    );
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((labelId) => {
        const label = threadLabels[labelId];
        const name = label.name.replace('Mono/', '');
        return (
          <Badge
            key={labelId}
            className="max-w-[180px] shrink-0 rounded-sm"
            style={{
              color: label.color.textColor || '',
              backgroundColor: label.color.backgroundColor || ''
            }}
            onClick={() => {
              openDialog('commandPalette', { pages: ['LABEL'] });
              trackEvent('label_dialog_opened', { thread_id: thread.id });
            }}
            sizeVariant={'xs'}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeLabel(labelId);
              }}
              className="ml-2 shrink-0 text-primary-foreground hover:text-primary-foreground"
              style={{ color: label.color.textColor || '' }}
              aria-label={t('header.display.remove_label', {
                defaultValue: 'Remove label {{name}}',
                name
              })}
              variant={'text'}
              typeVariant={'inline'}
            >
              <MonoIcon type={'X'} className="h-3 w-3" />
            </Button>
          </Badge>
        );
      })}
      {inTrash && (
        <Badge className="shrink-0 rounded-sm" sizeVariant={'xs'}>
          <span className="whitespace-nowrap">
            {t('header.display.in_trash', { defaultValue: 'In Trash' })}
          </span>
        </Badge>
      )}
    </div>
  );
};

export default ThreadLabelBadges;
