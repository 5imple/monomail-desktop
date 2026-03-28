import CalendarPanel from '@/renderer/app/containers/panel/CalendarPanel';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { FC } from 'react';

const AppCalendarPanelContainer: FC<{ className?: string }> = ({ className }) => {
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();

  return (
    <div
      className={cn(
        'items relative z-0 m-1 ml-0 flex max-w-[380px] flex-1 overflow-hidden rounded-lg border bg-card/70 shadow-sm dark:bg-card/60',
        // Only add transition if not loading
        !sidebarLoading && 'transition-all duration-300',
        sidebarCollapsed ? '' : ''
      )}
    >
      <div className={cn('relative flex-1 overflow-hidden', className)}>
        <CalendarPanel />
      </div>
    </div>
  );
};

export default AppCalendarPanelContainer;
