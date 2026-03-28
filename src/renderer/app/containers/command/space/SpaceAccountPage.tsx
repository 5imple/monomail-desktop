import React, { useCallback } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';

interface SpaceAccountPageProps {
  spaceName: string;
  selectedAccountIds: string[];
  setSelectedAccountIds: React.Dispatch<React.SetStateAction<string[]>>;
  onBack: () => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
  onCreateSpace: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  isEditing?: boolean;
}

const SpaceAccountPage: React.FC<SpaceAccountPageProps> = ({
  spaceName,
  selectedAccountIds,
  setSelectedAccountIds,
  onBack,
  searchValue,
  setSearchValue,
  onCreateSpace,
  bounce,
  onKeydown,
  isEditing = false
}) => {
  const { t } = useTranslation();
  const { accounts } = useAuth();

  // Toggle account selection
  const toggleAccountSelection = useCallback(
    (accountId: string) => {
      bounce();
      setSelectedAccountIds((prev) => {
        if (prev.includes(accountId)) {
          return prev.filter((id) => id !== accountId);
        } else {
          return [...prev, accountId];
        }
      });
    },
    [bounce, setSelectedAccountIds]
  );

  // Filter accounts based on search input
  const filteredAccounts =
    searchValue.trim() === ''
      ? accounts
      : accounts.filter(
          (account) =>
            account.email.toLowerCase().includes(searchValue.toLowerCase()) ||
            (account.displayName &&
              account.displayName.toLowerCase().includes(searchValue.toLowerCase()))
        );

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.space.accounts.placeholder')}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={onKeydown}
      />

      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>

        {/* Account selection list */}
        <CommandGroup className="p-2">
          {filteredAccounts.map((account) => {
            const isSelected = selectedAccountIds.includes(account.uid);

            return (
              <CommandItem
                key={account.uid}
                variant={'raycast'}
                value={account.email}
                onSelect={() => toggleAccountSelection(account.uid)}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <RecipientAvatar
                      className="mr-2"
                      recipient={{ email: account.email, name: account.displayName }}
                    />
                    <span>{account.email}</span>
                  </div>
                  {isSelected && <MonoIcon type={'Check'} className="ml-2" />}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {selectedAccountIds.length > 0 && (
          <CommandGroup className="p-2">
            <CommandItem variant={'raycast'} onSelect={onCreateSpace}>
              <CommandIcon type={isEditing ? 'CheckCircle' : 'Plus'} />
              <span>
                {isEditing
                  ? t('command_palette.space.accounts.save_changes')
                  : t('command_palette.space.accounts.create_space', { name: spaceName })}
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
};

export default SpaceAccountPage;
