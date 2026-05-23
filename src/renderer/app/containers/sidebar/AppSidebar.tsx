import UpdateNotificationCard from '@/renderer/app/components/card/UpdateNotificationCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import React, { useCallback } from 'react';
import AppSpaceContainer from '@/renderer/app/containers/sidebar/AppSpaceContainer';
import CustomizableSidebar from '@/renderer/app/containers/sidebar/CustomizableSidebar';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import useWindowFocus from '@/renderer/app/hooks/useWindowFocus';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';

interface AppSidebarProps {
  open: boolean;
}

const AppSidebar: FC<AppSidebarProps> = ({ open }) => {
  const { isWindowFocused } = useWindowFocus();
  const { openDialog } = useDialogs();
  const { t } = useTranslation();
  const { activateScope } = useHotkeyScope();
  const { sidebarLoading } = useSidebarAtom();

  const executeCommand = useExecuteCommand();
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(false);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;

    // Check if at top
    const atTop = target.scrollTop === 0;

    // Check if at bottom - properly calculate if scrolled to bottom
    // Need to account for potential rounding errors in some browsers
    const atBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 5;

    setIsAtTop(atTop);
    setIsAtBottom(atBottom);
  };

  const handleSearchClick = useCallback(() => {
    openDialog('commandPalette', {
      pages: ['SEARCH']
    });
  }, [openDialog]);

  return (
    <div
      ref={sidebarRef}
      className={cn(
        'flex h-full max-h-full w-full flex-col pt-1.5',
        !sidebarLoading && 'transition-all duration-200',
        open ? 'opacity-100' : '-translate-x-3 opacity-0'
      )}
      onClick={() => {
        activateScope('SIDEBAR');
      }}
    >
      {/* HEADER */}
      {isElectron && (
        <div
          className={cn(
            'drag flex h-10 w-full flex-shrink-0 items-center justify-start px-2',
            open ? 'flex-row justify-start' : 'flex-col justify-center'
          )}
        ></div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden pt-1">
        <div className={cn('block shrink-0 grow-0', !isAtTop && 'border-b shadow-sm')}>
          <div className="p-2 pt-0">
            <ul className={cn('grid list-none grid-cols-[repeat(var(--columns),1fr)] gap-1')}>
              <NavItem
                // id="search-nav"
                title={t('sidebar.search')}
                icon={'Search'}
                onClick={handleSearchClick}
                className="py-1 pr-2"
                append={
                  <Button
                    id="compose-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      executeCommand('COMPOSE_NEW_MESSAGE');
                    }}
                    className="hover:bg-muted-low"
                    tooltip={t('sidebar.compose')}
                    shortcut={'C'}
                    variant={'ghost'}
                    sizeVariant={'sm'}
                    tooltipSide="bottom"
                    typeVariant={'icon'}
                  >
                    <MonoIcon
                      type={'Edit'}
                      className={cn('h-5 w-5', isWindowFocused ? '' : 'text-muted-foreground')}
                    />
                  </Button>
                }
                hotkey={'MOD+F'}
              />
            </ul>
          </div>
          <AppSpaceContainer />
        </div>

        <div className="relative flex-1 overflow-hidden">
          <ScrollArea onScroll={handleScroll} viewportClassName="pb-12" className="h-full">
            <CustomizableSidebar />
          </ScrollArea>
        </div>
        <div id="help-preferences" className={cn('block shrink-0 grow-0')}>
          <div className="relative flex flex-col items-center justify-stretch gap-1.5">
            <UpdateNotificationCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppSidebar;
