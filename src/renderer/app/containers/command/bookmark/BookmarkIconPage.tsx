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
        placeholder={t('command_palette.bookmark.icon.placeholder')}
        value={bookmarkIcon}
        onValueChange={setBookmarkIcon}
        autoFocus
        renderCondition={(part) => part.includes(':')}
        onKeyDown={onKeydown}
      />
      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        <CommandGroup className="p-2" heading={t('command_palette.header.icons')}>
          {iconList.map((icon) => {
            if (!bookmarkIcon || !bookmarkIcon.includes(icon)) {
              return (
                <CommandItem
                  variant={'raycast'}
                  onSelect={handleIconSelect}
                  value={icon as string}
                  key={icon}
                  onClick={() => {
                    setBookmarkIcon(icon);
                    setTimeout(() => onClose(), 300);
                  }}
                >
                  <CommandIcon type={icon} className="mr-2" />
                  <span>{icon}</span>
                </CommandItem>
              );
            } else return null;
          })}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default BookmarkIconPage;
