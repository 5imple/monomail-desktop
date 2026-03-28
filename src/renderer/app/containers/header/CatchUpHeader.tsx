import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';

import React from 'react';

interface CatchUpHeaderProps {}

const CatchUpHeader = React.forwardRef<HTMLDivElement, CatchUpHeaderProps>(({}, ref) => {
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();

  return (
    <div ref={ref}>
      {/* <div ref={headerRef} className="flex items-center drag h-8"></div> */}

      <div className="drag flex items-center gap-3 p-2 pl-4">
        <div
          className={cn(
            'flex items-center gap-1',
            // Only add transition if not loading
            !sidebarLoading && 'transition-all duration-200',
            sidebarCollapsed && isElectron ? 'translate-x-[88px]' : ''
          )}
        >
          {!isElectron && sidebarCollapsed && <SidebarCollapseButton className="mr-2" />}
          <h1 className={cn('line-clamp-1 text-lg font-bold')}>Catch up</h1>
        </div>
        <div className="ml-auto flex h-10 items-center gap-2"></div>
      </div>
    </div>
  );
});
CatchUpHeader.displayName = 'CatchUpHeader';

export default CatchUpHeader;
