import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { useBookmarkAtom } from '@/renderer/app/store/bookmark/useBookmarkAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface BookmarkNamePageProps {
  searchQuery: string;
  bookmarkName: string;
  selectedAccountId: string;
  setBookmarkName: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  pushPage: (value: string[]) => void;
  /** No account chosen and several to choose from: go pick one. */
  onChooseAccount?: () => void;
}

const BookmarkNamePage: React.FC<BookmarkNamePageProps> = ({
  searchQuery,
  bookmarkName,
  selectedAccountId,
  setBookmarkName,
  onClose,
  bounce,
  onKeydown,
  pushPage,
  onChooseAccount
}) => {
  const { t } = useTranslation();
  const { closeDialog } = useDialogs();
  const { addOrUpdateBookmark } = useBookmarkAtom();
  const { searchNewQuery } = useGlobalAtom();

  const handleSaveBookmark = async () => {
    // The ⌘D path arrives here without an account: send the user to choose
    // one instead of a Save that only wobbled.
    if (!selectedAccountId) {
      bounce();
      onChooseAccount?.();
      return;
    }
    if (!bookmarkName.trim()) {
      bounce();
      return;
    }

    addOrUpdateBookmark(selectedAccountId, {
      query: searchQuery,
      title: bookmarkName.trim()
    });
    toast.success(t('toast.bookmark_saved', { name: bookmarkName.trim() }));

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
          {bookmarkName.trim() ? (
            <CommandItem variant={'raycast'} onSelect={handleSaveBookmark}>
              <CommandIcon type={'Bookmark'} />
              <span className="truncate">
                {t('command_palette.bookmark.name.save_as', {
                  query: searchQuery,
                  name: bookmarkName
                })}
              </span>
            </CommandItem>
          ) : (
            // Not 'Save "…" as ""': say what's missing.
            <div className="flex items-center px-2.5 py-2.5 text-sm text-muted-foreground">
              <CommandIcon type={'Bookmark'} />
              <span>{t('command_palette.bookmark.name.hint')}</span>
            </div>
          )}
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
