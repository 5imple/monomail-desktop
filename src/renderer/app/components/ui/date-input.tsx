import * as React from 'react';
import { Calendar } from '@/renderer/app/components/ui/calendar';
import { Button } from '@/renderer/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: Date;
  onValueChange: (value: Date) => void;
  sizeVariant?: 'default' | 'sm' | 'lg';
  keepDropdownAttr?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onValueChange,
  sizeVariant = 'sm',
  className,
  disabled,
  keepDropdownAttr = true,
  ...rest
}) => {
  const [open, setOpen] = React.useState(false);
  const commonKeep = keepDropdownAttr ? { 'data-calendar-keep-popover': 'true' } : {};

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-[140px] justify-between font-normal', className)}
          disabled={disabled}
          {...commonKeep}
        >
          {value ? value.toLocaleDateString() : 'Select date'}
          <MonoIcon type="ChevronDown" className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="dark w-auto overflow-hidden p-0" align="start" {...commonKeep}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (!d) return;
            onValueChange(d);
            setOpen(false);
          }}
          // Focus the chosen day (`initialFocus` does nothing in
          // react-day-picker 9; focus went to the previous-month button).
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateInput;
