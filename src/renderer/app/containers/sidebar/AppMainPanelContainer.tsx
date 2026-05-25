import { MailLayout } from '@/renderer/app/containers/layout/MailLayout';
import QueueContainer from '@/renderer/app/containers/queue/QueueContainer';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { FC } from 'react';

const AppMainPanelContainer: FC<{ className?: string }> = ({ className }) => {
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
  const { activeLayout } = useGlobalAtom();

  return (
    <div
      className={cn(
        'items relative z-0 flex flex-1 overflow-hidden bg-white dark:bg-background',
        // Only add transition if not loading
        !sidebarLoading && 'transition-all duration-300',
        sidebarCollapsed ? '' : ''
      )}
    >
      <div className={cn('relative flex-1 overflow-hidden', className)}>
        {activeLayout === 'LATER' ? <QueueContainer /> : <MailLayout />}
      </div>
    </div>
  );
};

export default AppMainPanelContainer;
