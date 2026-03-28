// WhatsNew.tsx
import React from 'react';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useTranslation } from 'react-i18next';
import { Timeline, TimelineItem } from './timeline';
import { ReleaseNote, useReleaseNotesAtom } from '@/renderer/app/store/layout/useReleaseNotesAtom';

interface WhatsNewProps {
  className?: string;
}

const WhatsNew: React.FC<WhatsNewProps> = ({ className }) => {
  const { t } = useTranslation();
  const { openDialog } = useDialogs();
  const executeCommand = useExecuteCommand();
  const { releaseNotes, showReleaseNoteByUID } = useReleaseNotesAtom();

  const handleViewChangelog = () => {
    // Open changelog URL in browser
    if (typeof window !== 'undefined') {
      window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/changelog`, '_blank');
    }
  };
  const handleOpenReleaseNote = (note: ReleaseNote) => {
    showReleaseNoteByUID(note.uid);
    // openDialog('releaseNote', { releaseNote: note });
  };

  // Get the last two release notes if available
  const recentReleaseNotes = releaseNotes?.slice(0, 2) || [];

  // Create items for Timeline based on release notes
  const items = [
    // Map release notes to timeline items
    ...recentReleaseNotes.map((note, index) => ({
      icon: index === 0 ? new Date(note.date).getDate().toString() : undefined,
      title: note.title,
      onClick: () => {
        handleOpenReleaseNote(note);
      }
      // badge: note.version
    })),
    // Add changelog link as last item
    {
      icon: <MonoIcon type="Calendar" />,
      title: t('whatsNew.fullChangelog', 'Full changelog'),
      isLink: true,
      external: true,
      onClick: handleViewChangelog,
      url: `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/changelog`
    }
  ];

  return (
    <div className={cn('', className)}>
      <h3 className="my-1 mb-2 ml-1 text-xs text-muted-foreground">
        {t('whatsNew.title', "What's new")}
      </h3>
      <Timeline items={items} compact={true} />
    </div>
  );
};

export default WhatsNew;
