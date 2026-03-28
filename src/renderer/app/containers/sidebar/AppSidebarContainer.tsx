import AppSidebar from '@/renderer/app/containers/sidebar/AppSidebar';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { FC, useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

interface AppSidebarContainerProps {
  className?: string;
}

const AppSidebarContainer: FC<AppSidebarContainerProps> = ({ className }) => {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    setSidebarHovered,
    sidebarHovered,
    sidebarLoading
  } = useSidebarAtom();

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHovering = useRef(false);

  useHotkeys(
    'MOD+\\',
    () => {
      if (!sidebarCollapsed) {
        setSidebarHovered(false);
      }
      setSidebarCollapsed(!sidebarCollapsed);
    },
    { preventDefault: true, useKey: true },
    [setSidebarCollapsed, sidebarCollapsed, setSidebarHovered]
  );

  const clearTimeouts = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleHoverStart = useCallback(() => {
    if (sidebarCollapsed) {
      isHovering.current = true;
      clearTimeouts();

      if (!sidebarHovered) {
        // Small delay to prevent accidental hovers
        hoverTimeoutRef.current = setTimeout(() => {
          if (isHovering.current) {
            setSidebarHovered(true);
          }
        }, 150);
      }
    }
  }, [sidebarCollapsed, sidebarHovered, clearTimeouts, setSidebarHovered]);

  const handleHoverEnd = useCallback(() => {
    if (sidebarCollapsed) {
      isHovering.current = false;
      clearTimeouts();

      // Longer delay before hiding to prevent rapid flickering
      hideTimeoutRef.current = setTimeout(() => {
        if (!isHovering.current) {
          setSidebarHovered(false);
        }
      }, 300);
    }
  }, [sidebarCollapsed, clearTimeouts, setSidebarHovered]);

  const handleButtonClick = () => {
    clearTimeouts();
    isHovering.current = false;
    if (!sidebarCollapsed) {
      setSidebarHovered(false);
    }
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const { registerAreaRef } = useKeyboardNavigationContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Register container ref with navigation system
  useEffect(() => {
    if (containerRef.current) {
      registerAreaRef('sidebar-nav', containerRef.current);
    }
  }, [registerAreaRef]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return clearTimeouts;
  }, [clearTimeouts]);

  // Reset hover state when sidebar is expanded
  useEffect(() => {
    if (!sidebarCollapsed) {
      isHovering.current = false;
      clearTimeouts();
      setSidebarHovered(false);
    }
  }, [sidebarCollapsed, clearTimeouts, setSidebarHovered]);

  return (
    <div className={cn('relative transition-opacity duration-150', className)}>
      {/* Hover trigger zone - only visible when sidebar is collapsed */}
      {sidebarCollapsed && (
        <div
          className={cn(
            'group absolute left-0 top-0 z-30 h-full bg-transparent',
            // Wider trigger zone when already hovered to prevent accidental hiding
            sidebarHovered ? 'w-16' : 'w-8'
          )}
          onMouseEnter={handleHoverStart}
          onMouseLeave={handleHoverEnd}
        >
          {/* Visual hint line that appears on hover */}
          <div className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 bg-border opacity-0 transition-opacity duration-200 group-hover:opacity-50" />
        </div>
      )}

      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          // Only add transition classes if not loading
          !sidebarLoading && 'transition-width duration-300 ease-bouncy-in-out',
          sidebarCollapsed ? 'w-0' : 'w-[220px]'
        )}
      ></div>

      {/* Sidebar container with comprehensive hover detection */}
      <div
        ref={containerRef}
        className={cn(
          'absolute top-0 z-0 h-full shrink-0 overflow-hidden',
          // Only add transition classes if not loading
          !sidebarLoading && 'transition-all duration-300 ease-bouncy-in-out',
          sidebarCollapsed
            ? sidebarHovered
              ? 'left-1 top-1 z-20 h-[calc(100%-8px)] w-[220px] rounded-xl border bg-card shadow-2xl'
              : '-translate-x-[220px]'
            : 'w-[220px]'
        )}
        data-nav-area="sidebar-nav"
        onMouseEnter={handleHoverStart}
        onMouseLeave={handleHoverEnd}
      >
        <AppSidebar open={!sidebarCollapsed || sidebarHovered} />
      </div>
    </div>
  );
};

export default AppSidebarContainer;
