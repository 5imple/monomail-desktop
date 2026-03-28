import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface BookmarkAccountPageProps {
  selectedAccountId: string;
  setSelectedAccountId: (accountId: string) => void;
  onClose: () => void;
  bounce: () => void;
  pushPage: (value: string[]) => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const BookmarkAccountPage: React.FC<BookmarkAccountPageProps> = ({
  selectedAccountId,
  setSelectedAccountId,
  onClose,
  pushPage,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const { activeSpace } = useSpaceAtom();
  const { accounts, getUidFromEmail } = useAuth();
  const [searchValue, setSearchValue] = React.useState('');

  const handleAccountSelect = (email: string) => {
    const uid = getUidFromEmail(email);

    bounce();
    setTimeout(() => setSearchValue(email), 250);

    if (uid) {
      setSelectedAccountId(uid);
      // Continue to the bookmark name page
      pushPage(['BOOKMARK_NAME']);
    }
  };

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.bookmark.account.placeholder') || 'Select account'}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={onKeydown}
      />
      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        <CommandGroup
          heading={t('command_palette.bookmark.account.title') || 'Select Account'}
          className="p-2"
        >
          {activeSpace?.activeAccountUids?.map((accountId) => {
            const accountInfo = accounts.find((account) => account.uid === accountId) ?? null;

            // Filter by search term if any
            if (
              !accountInfo ||
              (searchValue && !accountInfo?.email.toLowerCase().includes(searchValue.toLowerCase()))
            ) {
              return null;
            }

            return (
              <CommandItem
                variant={'raycast'}
                key={accountId}
                value={accountInfo.email}
                onSelect={() => handleAccountSelect(accountInfo.email)}
              >
                <RecipientAvatar
                  className="mr-2"
                  recipient={{ email: accountInfo.email, name: accountInfo.displayName }}
                />
                <span>{accountInfo.email}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default BookmarkAccountPage;
