import MonoIcon from '@/renderer/app/components/icons/SidebarIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { FC, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarCollapseButtonProps {
  className?: string;
}

const COLLAPSE_ICON_SIZE = 15;

const SidebarCollapseButton: FC<SidebarCollapseButtonProps> = ({ className }) => {
  const { t } = useTranslation();
  const {
    sidebarCollapsed,
    sidebarHovered,
    setSidebarCollapsed,
    setSidebarHovered,
    sidebarLoading
  } = useSidebarAtom();

  // Memoize tooltip text
  const tooltipText = useMemo(
    () => (sidebarCollapsed ? t('sidebar.open_sidebar') : t('sidebar.close_sidebar')),
    [sidebarCollapsed, t]
  );

  // Determine the icon type
  const iconType = sidebarCollapsed ? (sidebarHovered ? 'ChevronsRight' : 'Menu') : 'ChevronsLeft';

  // Hover-to-peek with the same timing as the left-edge zone (150ms in, 300ms
  // out). Hiding at once on leave closed the peek while the pointer crossed
  // the gap down into it, then reopened it.
  const openTimerRef = useRef<number>();
  const hideTimerRef = useRef<number>();
  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(hideTimerRef.current);
    openTimerRef.current = undefined;
    hideTimerRef.current = undefined;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const handleHoverStart = useCallback(() => {
    if (!sidebarCollapsed) return;
    clearTimers();
    openTimerRef.current = window.setTimeout(() => setSidebarHovered(true), 150);
  }, [sidebarCollapsed, clearTimers, setSidebarHovered]);

  const handleHoverEnd = useCallback(() => {
    if (!sidebarCollapsed) return;
    clearTimers();
    hideTimerRef.current = window.setTimeout(() => {
      // Landed in the peek card or the edge zone: they keep it open.
      const stillOver = document.querySelector(
        '[data-nav-area="sidebar-nav"]:hover, [data-sidebar-peek-zone]:hover'
      );
      if (!stillOver) setSidebarHovered(false);
    }, 300);
  }, [sidebarCollapsed, clearTimers, setSidebarHovered]);

  // Click handler with functional update (avoids stale closures)
  const handleButtonClick = () => {
    clearTimers();
    setSidebarCollapsed(!sidebarCollapsed);
  };
  return (
    <Button
      className={cn(
        // Only add transition if not loading
        !sidebarLoading && 'transition-all',
        'h-[36px] w-[36px]',
        className
      )}
      onClick={handleButtonClick}
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
      variant="ghost"
      typeVariant="icon"
      tooltip={tooltipText}
      shortcut="MOD+\"
      sizeVariant="sm"
    >
      <MonoIcon type={iconType} size={COLLAPSE_ICON_SIZE} className="text-muted-foreground" />
    </Button>
  );
};

export default SidebarCollapseButton;
