import MonoIcon from '@/renderer/app/components/icons/SidebarIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { FC, useCallback, useMemo } from 'react';
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
    [sidebarCollapsed]
  );

  // Determine the icon type
  const iconType = sidebarCollapsed ? (sidebarHovered ? 'ChevronsRight' : 'Menu') : 'ChevronsLeft';

  // Hover handlers
  const handleHoverStart = useCallback(() => {
    if (sidebarCollapsed) setSidebarHovered(true);
  }, [sidebarCollapsed, setSidebarHovered]);

  const handleHoverEnd = useCallback(() => {
    if (sidebarCollapsed) setSidebarHovered(false);
  }, [sidebarCollapsed, setSidebarHovered]);

  // Click handler with functional update (avoids stale closures)
  const handleButtonClick = () => {
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
