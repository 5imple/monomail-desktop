import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface BookmarkNamePageProps {
  searchQuery: string;
  bookmarkName: string;
  selectedAccountId: string;
  setBookmarkName: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  pushPage: (value: string[]) => void;
}

const BookmarkNamePage: React.FC<BookmarkNamePageProps> = ({
  searchQuery,
  bookmarkName,
  selectedAccountId,
  setBookmarkName,
  onClose,
  bounce,
  onKeydown,
  pushPage
}) => {
  const { t } = useTranslation();
  const { closeDialog } = useDialogs();
  const { addOrUpdateBookmark } = useBookmarkAtom();
  const { searchNewQuery } = useGlobalAtom();
  const { getUidFromEmail } = useAuth();

  const handleSaveBookmark = async () => {
    if (!selectedAccountId || !bookmarkName) {
      bounce();
      return;
    }

    addOrUpdateBookmark(selectedAccountId, {
      query: searchQuery,
      title: bookmarkName
    });

    searchNewQuery(searchQuery, undefined, false);
    bounce();
    closeDialog('commandPalette');
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.bookmark.name.placeholder')}
        value={bookmarkName}
        onValueChange={setBookmarkName}
        autoFocus
        onKeyDown={onKeydown}
      />
      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        <CommandGroup heading={t('command_palette.header.save_bookmark')} className="p-2">
          <CommandItem variant={'raycast'} onSelect={handleSaveBookmark}>
            <CommandIcon type={'Bookmark'} />
            <span>
              {t('command_palette.bookmark.name.save_as', {
                query: searchQuery,
                name: bookmarkName
              })}
            </span>
          </CommandItem>
          {bookmarkName.length > 0 && (
            <CommandItem
              variant={'raycast'}
              onSelect={() => {
                pushPage(['BOOKMARK_ICON']);
              }}
            >
              <CommandIcon type={'Mono'} />
              <span>{t('command_palette.bookmark.name.set_icon_for', { name: bookmarkName })}</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default BookmarkNamePage;
