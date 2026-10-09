import React, { useEffect, useState } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { MonoIconType } from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { cn } from '@/renderer/app/lib/utils';
import { useCommandState } from 'cmdk';

interface SpaceOptionsPageProps {
  selectedSpaceId: string | null;
  spaceName: string;
  /** Switch to the selected space and close the palette. */
  onSwitchToSpace?: () => void;
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
  onSwitchToSpace,
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
  // Delete asks inside the palette — a first Enter arms it, a second deletes —
  // instead of an OS confirm box that broke the palette's focus and theme.
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Disarm on any other move (selection, filter text), so a stray Enter
  // later can't delete.
  const selectedValue = useCommandState((state) => state.value);
  useEffect(() => {
    if (selectedValue !== 'delete') setDeleteArmed(false);
  }, [selectedValue]);
  useEffect(() => {
    setDeleteArmed(false);
  }, [searchValue, selectedSpaceId]);

  const isActiveSpace = !!activeSpace && !!selectedSpaceId && activeSpace.id === selectedSpaceId;

  // Define the options for space editing
  const options: {
    id: string;
    name: string;
    icon: string;
    onSelect?: () => void;
    danger?: boolean;
    disabled?: boolean;
    hint?: string;
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

  // Picking a space here used to only open these options; switching to it
  // wasn't possible from the palette at all.
  if (selectedSpaceId && !isActiveSpace && onSwitchToSpace) {
    options.unshift({
      id: 'switch',
      name: t('command_palette.space.options.switch_to', { name: spaceName }),
      icon: 'Planet',
      onSelect: () => {
        bounce();
        onSwitchToSpace();
      }
    });
  }

  if (selectedSpaceId) {
    options.push(
      isActiveSpace
        ? {
            id: 'delete',
            name: t('command_palette.space.options.delete_space'),
            icon: 'Trash',
            danger: true,
            disabled: true,
            // Shown instead of the option silently missing.
            hint: t('command_palette.space.options.delete_disabled_hint')
          }
        : {
            id: 'delete',
            name: deleteArmed
              ? t('command_palette.space.options.delete_confirm_again', { name: spaceName })
              : t('command_palette.space.options.delete_space'),
            icon: 'Trash',
            danger: true,
            onSelect: () => {
              bounce();
              if (!deleteArmed) {
                setDeleteArmed(true);
                return;
              }
              setDeleteArmed(false);
              onDeleteSpace?.();
            }
          }
    );
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
              value={option.id === 'delete' ? 'delete' : option.name}
              keywords={option.id === 'delete' ? [option.name] : undefined}
              disabled={option.disabled}
              onSelect={() => {
                if (option.disabled) return;
                option.onSelect?.();
              }}
              data-danger={option.danger ? '' : undefined}
              // Both spellings: the base variants use quoted and unquoted
              // data-[selected] forms, and both must be overridden.
              className={cn(
                option.danger &&
                  `text-destructive data-[selected='true']:bg-destructive/15 data-[selected=true]:bg-destructive/15 data-[selected='true']:text-destructive data-[selected=true]:text-destructive`
              )}
            >
              <CommandIcon
                type={option.icon as MonoIconType}
                className={cn(
                  option.danger && 'text-destructive group-data-[selected=true]:text-destructive'
                )}
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.hint && (
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">{option.hint}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceOptionsPage;
