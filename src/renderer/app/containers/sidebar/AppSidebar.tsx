import UpdateNotificationCard from '@/renderer/app/components/card/UpdateNotificationCard';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import React, { useCallback } from 'react';
import AppSpaceContainer from '@/renderer/app/containers/sidebar/AppSpaceContainer';
import CustomizableSidebar from '@/renderer/app/containers/sidebar/CustomizableSidebar';
import NavItem from '@/renderer/app/containers/sidebar/NavItem';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
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
  const { openDialog } = useDialogs();
  const { t } = useTranslation();
  const { activateScope, deactivateScope } = useHotkeyScope();
  const { sidebarLoading, sidebarCollapsed } = useSidebarAtom();

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

  // Clicking anywhere in the sidebar activates the SIDEBAR hotkey scope, but
  // nothing previously deactivated it — once activated it stayed on for the
  // rest of the session, so any future SIDEBAR-scoped hotkey would fire
  // globally after the first sidebar click. Deactivate on mouse-leave and unmount.
  useEffect(() => {
    return () => deactivateScope('SIDEBAR');
  }, [deactivateScope]);

  return (
    <div
      ref={sidebarRef}
      className={cn(
        'flex h-full max-h-full w-full flex-col pt-1.5',
        // Only the open/close fade and slide; animating every property also
        // animated text colour across a theme switch.
        !sidebarLoading && 'transition-[opacity,transform] duration-200',
        open ? 'opacity-100' : '-translate-x-3 opacity-0'
      )}
      onClick={() => {
        activateScope('SIDEBAR');
      }}
      onMouseLeave={() => {
        deactivateScope('SIDEBAR');
      }}
    >
      {/* Under the titlebar: h-8 puts Search level with the list's filter
          tabs. A window-drag area only while docked — in the floating peek
          card a drag strip moved the window and could close the peek. */}
      {isElectron && (
        <div className={cn('h-8 w-full flex-shrink-0', !sidebarCollapsed && 'drag')}></div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden pt-1">
        <div className={cn('block shrink-0 grow-0', !isAtTop && 'border-b shadow-sm')}>
          <div className="p-2 pt-0">
            <ul className={cn('grid list-none grid-cols-[repeat(var(--columns),1fr)] gap-1')}>
              {/* Compose lives in the titlebar (always visible, teaches C); a
                  second compose button here differed in glyph, size and
                  tooltip. MOD+F is the global SEARCH command — binding it here
                  too ran two handlers per press. */}
              <NavItem
                // id="search-nav"
                title={t('sidebar.search')}
                icon={'Search'}
                onClick={handleSearchClick}
                className="group py-1 pr-2"
                append={
                  <span
                    aria-hidden
                    className="flex pr-1 opacity-0 transition-opacity group-pointer-hover:opacity-100"
                  >
                    <ShortcutKeyboard variant="flat" shortcut="MOD+F" />
                  </span>
                }
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
