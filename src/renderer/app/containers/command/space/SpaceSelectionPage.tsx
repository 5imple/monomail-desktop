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
                <div className="flex items-center">
                  <div
                    className="mr-3 flex items-center justify-center rounded-md p-1.5 text-white"
                    style={{
                      backgroundColor: `${space.color}`
                      // color: `${space.color}`
                    }}
                  >
                    <MonoIcon type={space.icon as MonoIconType} />
                  </div>
                  <span>{space.name}</span>
                </div>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('command_palette.space.selection.accounts_count', {
                    count: space.accountUids.length
                  })}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Create New Space option */}
        {!filteredSpaces.find((space) => space.name === spaceName) && (
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
