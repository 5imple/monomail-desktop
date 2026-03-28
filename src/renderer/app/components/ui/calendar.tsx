import * as React from 'react';
import { DayPicker } from 'react-day-picker';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { buttonVariants } from '@/renderer/app/components/ui/button';
import { cn } from '@/renderer/app/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col ',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center justify-between absolute left-3 right-3',
        button_previous: cn(
          buttonVariants({ variant: 'secondary', typeVariant: 'icon', sizeVariant: 'sm' })
          // 'absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'secondary', typeVariant: 'icon', sizeVariant: 'sm' })
          // 'absolute right-1'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-full font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: cn(
          'transition-colors rounded-md h-8 w-8 p-0 font-normal text-center text-sm mx-auto',
          '[&:not([data-today])]:hover:bg-muted-low [&:not([data-today])]:focus-visible:relative [&:not([data-today])]:focus-visible:z-20',
          '[data-selected="true"]:opacity-100',
          '[data-today="true"]:hover:bg-destructive/80'
        ),
        day_button: 'h-8 w-8 p-0 font-normal transition-colors rounded-md ',
        range_end: 'day-range-end',
        today:
          'bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:text-destructive-foreground',
        selected: cn(
          '[&:not([data-today])]:bg-muted-low [&:not([data-today])]:text-foreground [&:not([data-today])]:hover:bg-muted-low/80',
          '[data-today="true"]:bg-destructive [data-today="true"]:text-destructive-foreground'
        ),
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'aria-selected:bg-muted-low aria-selected:text-foreground',
        hidden: 'invisible',
        ...classNames
      }}
      components={{
        Chevron: ({ orientation, ...props }) => {
          const Icon = orientation === 'left' ? 'ChevronLeft' : 'ChevronRight';
          return <MonoIcon type={Icon} className="h-4 w-4" {...props} />;
        }
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
