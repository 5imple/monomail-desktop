import React from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';

interface SpaceOptionsPageProps {
  selectedSpaceId: string | null;
  spaceName: string;
  onGoToAccounts: () => void;
  onGoToName?: () => void;
  onGoToIcon?: () => void;
  onGoToColor?: () => void;
  onDeleteSpace?: () => void;
  onBack: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
}

const SpaceOptionsPage: React.FC<SpaceOptionsPageProps> = ({
  selectedSpaceId,
  spaceName,
  onGoToAccounts,
  onGoToName,
  onGoToIcon,
  onGoToColor,
  onDeleteSpace,
  onBack,
  bounce,
  onKeydown,
  searchValue,
  setSearchValue
}) => {
  const { t } = useTranslation();
  const { activeSpace } = useSpaceAtom();

  // Define the options for space editing
  const options: {
    id: string;
    name: string;
    icon: string;
    onSelect: () => void;
    danger?: boolean;
  }[] = [
    {
      id: 'accounts',
      name: t('command_palette.space.options.manage_accounts'),
      icon: 'UserGroup',
      onSelect: onGoToAccounts
    },
    {
      id: 'name',
      name: t('command_palette.space.options.change_name'),
      icon: 'Pen',
      onSelect: () => {
        bounce();
        if (onGoToName) onGoToName();
      }
    },
    {
      id: 'icon',
      name: t('command_palette.space.options.change_icon'),
      icon: 'Mono',
      onSelect: () => {
        bounce();
        if (onGoToIcon) onGoToIcon();
      }
    },
    {
      id: 'color',
      name: t('command_palette.space.options.change_color'),
      icon: 'PaintBrush',
      onSelect: () => {
        bounce();
        if (onGoToColor) onGoToColor();
      }
    }
  ];

  if (activeSpace && selectedSpaceId && activeSpace.id !== selectedSpaceId) {
    options.push({
      id: 'delete',
      name: t('command_palette.space.options.delete_space'),
      icon: 'Trash',
      danger: true,
      onSelect: () => {
        bounce();
        if (onDeleteSpace) {
          // Show confirmation before deleting
          if (
            window.confirm(
              t('command_palette.space.options.delete_confirmation', { name: spaceName })
            )
          ) {
            onDeleteSpace();
          }
        }
      }
    });
  }

  // Filter options based on search
  const filteredOptions =
    searchValue.trim() === ''
      ? options
      : options.filter((option) => option.name.toLowerCase().includes(searchValue.toLowerCase()));

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.space.options.edit_space', { name: spaceName })}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={onKeydown}
      />

      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>

        <CommandGroup className="p-2" heading={t('command_palette.space.options.heading')}>
          {filteredOptions.map((option) => (
            <CommandItem
              key={option.id}
              variant={'raycast'}
              value={option.name}
              onSelect={option.onSelect}
              className={
                option.danger
                  ? `text-destructive data-[selected='true']:bg-destructive/20 data-[selected='true']:text-destructive`
                  : ''
              }
            >
              <CommandIcon
                type={option.icon as MonoIconType}
                className={
                  option.danger
                    ? `text-destructive data-[selected='true']:bg-destructive/20 group-data-[selected=true]:text-destructive`
                    : ''
                }
              />
              <span>{option.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceOptionsPage;
