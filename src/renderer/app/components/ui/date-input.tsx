import * as React from 'react';
import { Input } from '@/renderer/app/components/ui/input';
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

const formatDate = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

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
  const [internal, setInternal] = React.useState<string>(formatDate(value));

  React.useEffect(() => {
    setInternal(formatDate(value));
  }, [value]);

  const commonKeep = keepDropdownAttr ? { 'data-calendar-keep-popover': 'true' } : {};

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-[140px] justify-between font-normal', className)}
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
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateInput;
