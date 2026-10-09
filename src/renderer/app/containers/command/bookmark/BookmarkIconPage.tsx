import { MonoIconType } from '@/renderer/app/components/icons/icons';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface BookmarkIconPageProps {
  searchQuery: string;
  bookmarkName: string;
  selectedAccountId: string;
  bookmarkIcon?: string;
  setBookmarkIcon: (icon: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const BookmarkIconPage: React.FC<BookmarkIconPageProps> = ({
  searchQuery,
  bookmarkName,
  selectedAccountId,
  bookmarkIcon,
  setBookmarkIcon,
  onClose,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const iconList: MonoIconType[] = AVAILABLE_ICONS;

  const { closeDialog } = useDialogs();
  const { addOrUpdateBookmark } = useBookmarkAtom();
  const { searchNewQuery } = useGlobalAtom();

  const handleSaveBookmark = async (icon: MonoIconType) => {
    if (!selectedAccountId || !bookmarkName) {
      bounce();
      return;
    }

    addOrUpdateBookmark(selectedAccountId, {
      query: searchQuery,
      title: bookmarkName,
      icon: icon
    });
    toast.success(t('toast.bookmark_saved', { name: bookmarkName }));

    searchNewQuery(searchQuery, undefined, false);
    bounce();
    closeDialog('commandPalette');
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleIconSelect = (icon: string) => {
    // Find the matching icon in iconList
    const monoIcon = iconList.find((item) => item === icon) as MonoIconType | undefined;
    if (monoIcon) {
      setBookmarkIcon('');
      handleSaveBookmark(monoIcon);
    }
  };

  return (
    <>
      <EnhancedCommandInput
        // The stored key is an empty string, so a default can't apply to it.
        placeholder={t('command_palette.bookmark.icon.search_placeholder', 'Search icons…')}
        value={bookmarkIcon}
        onValueChange={setBookmarkIcon}
        autoFocus
        renderCondition={(part) => part.includes(':')}
        onKeyDown={onKeydown}
      />
      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        <CommandGroup className="p-2" heading={t('command_palette.header.icons')}>
          {/* cmdk filters by value (the old guard hid the icon you typed, and
              the extra onClick left its name behind for the next visit). */}
          {iconList.map((icon) => (
            <CommandItem
              variant={'raycast'}
              onSelect={handleIconSelect}
              value={icon as string}
              key={icon}
            >
              <CommandIcon type={icon} />
              <span>{icon}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default BookmarkIconPage;
