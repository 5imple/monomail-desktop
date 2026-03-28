import React from 'react';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';

// A simple component to display date separators in the thread list
const DateSeparator = ({
  date,
  firstThreadTimestamp,
  isScrolled
}: {
  date: string;
  isScrolled: boolean;
  firstThreadTimestamp: number;
}) => {
  // Get the current date
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Convert timestamp to date object if provided
  const threadDate = firstThreadTimestamp ? new Date(firstThreadTimestamp) : null;

  // Function to get day number if it's in current month
  const getDayNumber = () => {
    if (!threadDate) return null;

    // Only show day number for current month dates
    if (threadDate.getMonth() === currentMonth && threadDate.getFullYear() === currentYear) {
      return threadDate.getDate();
    }

    return null;
  };

  // Get border color based on date type
  const getBorderTopColor = () => {
    if (date === 'Today') return 'border-t-primary';
    if (date === 'Yesterday') return 'border-t-blue-500';

    // Weekdays with specific colors
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekdayIndex = weekdays.indexOf(date);
    if (weekdayIndex >= 0) {
      const colors = [
        'border-t-indigo-400', // Monday
        'border-t-pink-400', // Tuesday
        'border-t-green-400', // Wednesday
        'border-t-amber-400', // Thursday
        'border-t-purple-400', // Friday
        'border-t-red-400', // Saturday
        'border-t-red-400' // Sunday
      ];
      return colors[weekdayIndex];
    }

    return 'border-t-muted-foreground';
  };

  const dayNumber = getDayNumber();
  const showCalendarBox = dayNumber !== null;

  return (
    <div
      className={cn(
        'mt-6 bg-card px-3 pb-3 pt-3',
        'sticky top-0 z-40'
        // isScrolled ? 'border-b border-border shadow-sm' : 'border-t border-border first:border-t-0'
      )}
    >
      <div className="flex items-center space-x-2">
        {/* {showCalendarBox ? (
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-sm border border-t-[3px] text-[0.75rem] text-muted-foreground',
              getBorderTopColor()
            )}
          >
            {dayNumber}
          </div>
        ) : (
          <MonoIcon type="Calendar" className="h-4 w-4 text-muted-foreground" />
        )} */}
        <h3 className="text-sm font-medium text-foreground">{date}</h3>
      </div>
    </div>
  );
};

export default DateSeparator;
