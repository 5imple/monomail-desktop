import SpaceCard from '@/renderer/app/components/card/space/SpaceCard';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
// Billing util imports removed — payment-free build. Space limits are
// unlimited; the gating UI below evaluates accordingly.
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import React, { FC, useEffect, useRef, useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';

interface AppSpaceContainerProps {}

const AppSpaceContainer: FC<AppSpaceContainerProps> = ({}) => {
  const { spaces, activeSpace, switchSpace } = useSpaceAtom();
  const { openDialog } = useDialogs();
  const { t } = useTranslation();
  const { registerItem, registerAreaRef, unregisterItem, setPivotIndex } =
    useKeyboardNavigationContext();

  // Payment-free build — unlimited spaces, no plan gating.
  const spaceLimit = Infinity;
  const canCreateSpace = true;
  const isLimitedPlan = false;
  const BASIC_SPACE_LIMIT = 2;

  // Ref for the container area
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for individual space cards and add button
  const spaceRefs = useRef<Map<string, HTMLElement>>(new Map());
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const handleSpaceClick = (e, spaceId: string) => {
    switchSpace(spaceId);
  };

  const handleSpaceRightClick = (spaceId: string) => {
    openDialog('commandPalette', {
      pages: ['SPACE'],
      selectedSpaceId: spaceId
    });
  };

  const handleDisabledSpaceClick = (e: React.MouseEvent, spaceId: string) => {
    // Open billing preferences when clicking on disabled spaces
    openDialog('preference', { defaultPage: 'billing' });
  };

  const handleAddSpace = () => {
    if (!canCreateSpace) {
      openDialog('preference', { defaultPage: 'billing' });
      return;
    }
    openDialog('commandPalette', { pages: ['SPACE'] });
  };

  // Register the area container
  useEffect(() => {
    if (containerRef.current) {
      registerAreaRef('space-nav', containerRef.current);
    }
  }, []);

  // Register space cards when spaces change
  useEffect(() => {
    // Clear existing registrations
    spaceRefs.current.forEach((_, spaceId) => {
      unregisterItem('space-nav', spaceId);
    });
    spaceRefs.current.clear();

    // Register each space card (skip disabled ones)
    spaces.forEach((space, index) => {
      const isDisabled = isLimitedPlan && index >= BASIC_SPACE_LIMIT;
      const spaceRef = spaceRefs.current.get(space.id);
      if (spaceRef && !isDisabled) {
        registerItem('space-nav', space.id, spaceRef);
      }
    });

    // Register the add button
    if (addButtonRef.current) {
      registerItem('space-nav', 'add-space-button', addButtonRef.current);
    }
  }, [spaces, isLimitedPlan]);

  // Check if active space is disabled and switch to first available space
  useEffect(() => {
    if (activeSpace && spaces.length > 0) {
      const activeSpaceIndex = spaces.findIndex((space) => space.id === activeSpace.id);
      const isActiveSpaceDisabled = isLimitedPlan && activeSpaceIndex >= BASIC_SPACE_LIMIT;

      if (isActiveSpaceDisabled) {
        // Switch to the first available space (within limit)
        const firstAvailableSpace = spaces.find((space, index) => {
          return !(isLimitedPlan && index >= BASIC_SPACE_LIMIT);
        });
        if (firstAvailableSpace) {
          switchSpace(firstAvailableSpace.id);
        }
      }
    }
  }, [activeSpace, spaces, isLimitedPlan, switchSpace]);

  // Update pivot when active space changes
  useEffect(() => {
    if (activeSpace && spaces.length > 0) {
      const activeSpaceIndex = spaces.findIndex((space) => space.id === activeSpace.id);
      const isActiveSpaceDisabled = isLimitedPlan && activeSpaceIndex >= BASIC_SPACE_LIMIT;
      // Only set pivot if the active space is not disabled
      if (activeSpaceIndex >= 0 && !isActiveSpaceDisabled) {
        setPivotIndex('space-nav', activeSpaceIndex);
      }
    }
  }, [activeSpace, spaces, isLimitedPlan]);

  const hotkeyHandlers = React.useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        key: `MOD+${index + 1}`,
        handler: () => {
          const space = spaces[index];
          const isDisabled = isLimitedPlan && index >= BASIC_SPACE_LIMIT;
          if (space && !isDisabled) {
            switchSpace(space.id);
          } else if (space && isDisabled) {
            // Open billing preferences for disabled spaces
            openDialog('preference', { defaultPage: 'billing' });
          }
        },
        enabled: index < spaces.length
      })),
    [spaces, switchSpace, isLimitedPlan, openDialog]
  );
  hotkeyHandlers.forEach(({ key, handler, enabled }) => {
    useHotkeys(key, handler, { enabled, preventDefault: true }, [handler]);
  });

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="mx-2 grid grid-cols-2 gap-2"
        data-navigation-area="space-nav"
      >
        {activeSpace &&
          spaces.map((space, index) => {
            // Check if this space should be disabled for limited plans
            const isDisabled = isLimitedPlan && index >= BASIC_SPACE_LIMIT;

            return (
              <SpaceCard
                key={space.id}
                active={activeSpace.id === space.id && !isDisabled}
                disabled={isDisabled}
                name={space.name}
                color={space.color}
                icon={space.icon as MonoIconType}
                onClick={handleSpaceClick}
                onDisabledClick={handleDisabledSpaceClick}
                onRightClick={handleSpaceRightClick}
                spaceId={space.id}
                tooltip={
                  isDisabled ? (
                    <div>
                      <div className="">{t('settings.billing.upgrade_required')}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-0.5">{t('sidebar.change_space')}</div>
                      <ShortcutKeyboard variant="flat" shortcut={`MOD+${index + 1}`} />
                    </div>
                  )
                }
                data-navigation-id={space.id}
              />
            );
          })}
        <Button
          onClick={handleAddSpace}
          variant={'outline'}
          className={cn('justify-center rounded-lg border-dashed bg-transparent')}
        >
          <MonoIcon type={'Plus'} className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <div className="mr-2 text-sm text-muted-foreground">{t('sidebar.space')}</div>
        </Button>
      </div>

      {/* Space limit indicator */}
      {/* {spaceLimit !== -1 && (
        <div className="mx-2 text-center">
          <div className="text-xs text-muted-foreground">
            {spaces.length} / {spaceLimit} {t('sidebar.spaces_used')}
          </div>
          {!canCreateSpace && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs underline"
              onClick={() => openDialog('preference', { defaultPage: 'billing' })}
            >
              {t('plan_selection.upgrade')}
            </Button>
          )}
        </div>
      )} */}
    </div>
  );
};

export default AppSpaceContainer;
