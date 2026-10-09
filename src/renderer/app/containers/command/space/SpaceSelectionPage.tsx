import React, { useState, useEffect } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useTranslation } from 'react-i18next';

// A dark icon on light space colours (white on Yellow or Silver was ~1.5:1),
// white otherwise. Only for #rrggbb; anything else keeps white.
const iconColorOn = (hex?: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? 'hsl(24 10% 10%)' : '#ffffff';
};

interface SpaceSelectionPageProps {
  spaceName: string;
  setSpaceName: (name: string) => void;
  onSelectSpace: (spaceId: string) => void;
  onCreateNew: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SpaceSelectionPage: React.FC<SpaceSelectionPageProps> = ({
  spaceName,
  setSpaceName,
  onSelectSpace,
  onCreateNew,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const { spaces } = useSpaceAtom();
  const [filteredSpaces, setFilteredSpaces] = useState(spaces);

  // Filter spaces based on input
  useEffect(() => {
    if (spaceName.trim() === '') {
      setFilteredSpaces(spaces);
    } else {
      const filtered = spaces.filter((space) =>
        space.name.toLowerCase().includes(spaceName.toLowerCase())
      );
      setFilteredSpaces(filtered);
    }
  }, [spaceName, spaces]);

  // Check if current input matches exactly any existing space
  const exactMatchSpace = spaces.find(
    (space) => space.name.toLowerCase() === spaceName.toLowerCase()
  );

  // Handle continuing to create a new space
  const handleCreateNew = () => {
    if (spaceName.trim()) {
      bounce();
      onCreateNew();
    }
  };

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.space.selection.placeholder')}
        value={spaceName}
        onValueChange={setSpaceName}
        autoFocus
        onKeyDown={onKeydown}
      />
      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        {/* Existing Spaces */}
        {filteredSpaces.length > 0 && (
          <CommandGroup
            heading={t('command_palette.space.selection.existing_heading')}
            className="p-2"
          >
            {filteredSpaces.map((space) => (
              <CommandItem
                key={space.id}
                variant={'raycast'}
                value={space.name}
                onSelect={() => {
                  bounce();
                  setSpaceName('');
                  onSelectSpace(space.id);
                }}
              >
                <div className="flex min-w-0 items-center">
                  <div
                    className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: `${space.color}`,
                      color: iconColorOn(space.color)
                    }}
                  >
                    <MonoIcon type={space.icon as MonoIconType} />
                  </div>
                  <span className="truncate">{space.name}</span>
                </div>
                <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">
                  {t('command_palette.space.selection.accounts_count', {
                    count: space.accountUids.length
                  })}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Create New Space option — only once there's a name, and never a
            second "Work" next to "work". */}
        {spaceName.trim() && !exactMatchSpace && (
          <CommandGroup heading={t('command_palette.header.create_new_space')} className="p-2">
            <CommandItem
              disabled={!spaceName.trim()}
              variant={'raycast'}
              value={`${spaceName}`}
              onSelect={handleCreateNew}
            >
              <CommandIcon type={'Planet'} />
              <span>{t('command_palette.space.selection.create_space', { name: spaceName })}</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
};

export default SpaceSelectionPage;
