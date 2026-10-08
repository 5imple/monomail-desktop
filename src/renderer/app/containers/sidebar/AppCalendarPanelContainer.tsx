import CalendarPanel from '@/renderer/app/containers/panel/CalendarPanel';
import { cn } from '@/renderer/app/lib/utils';
import { FC } from 'react';

// Hidden state (Tab order, screen readers) is handled by AppLayout's wrapper,
// which turns `invisible` once the panel has slid out.
const AppCalendarPanelContainer: FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={cn(
        // Even margin all round: with none on the left the list's scrollbar
        // ran into the card's border.
        'relative z-0 m-1 flex flex-1 overflow-hidden rounded-lg border bg-card/70 shadow-sm dark:bg-card/60'
      )}
    >
      <div className={cn('relative flex-1 overflow-hidden', className)}>
        <CalendarPanel />
      </div>
    </div>
  );
};

export default AppCalendarPanelContainer;
