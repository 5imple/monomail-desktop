import * as React from 'react';

import { Input } from '@/renderer/app/components/ui/input';
import { cn } from '@/renderer/app/lib/utils';

export interface TimeInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string; // HH:mm (24h)
  onValueChange: (value: string) => void; // HH:mm (24h)
  sizeVariant?: 'default' | 'sm' | 'lg';
  keepPopoverAttr?: boolean;
}

export const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onValueChange,
  sizeVariant = 'sm',
  className,
  disabled,
  keepPopoverAttr = false,
  ...rest
}) => {
  const [internal, setInternal] = React.useState(value);

  React.useEffect(() => {
    setInternal(value);
  }, [value]);

  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
  const parseText = (raw: string): { valid: boolean; hh: number; mm: number } => {
    const cleaned = raw.trim().toLowerCase();
    // Accept forms: HH:mm, H:mm, HHmm, hmma, hh:mma, etc.
    const ampm = cleaned.endsWith('am') || cleaned.endsWith('pm') ? cleaned.slice(-2) : '';
    const body = ampm ? cleaned.slice(0, -2).trim() : cleaned;
    let hh = 0;
    let mm = 0;
    if (body.includes(':')) {
      const [hStr, mStr] = body.split(':');
      hh = parseInt(hStr || '0', 10);
      mm = parseInt(mStr || '0', 10);
    } else if (body.length >= 3) {
      const hStr = body.slice(0, body.length - 2);
      const mStr = body.slice(-2);
      hh = parseInt(hStr || '0', 10);
      mm = parseInt(mStr || '0', 10);
    } else {
      const n = parseInt(body || '0', 10);
      if (n >= 0 && n <= 23) {
        hh = n;
        mm = 0;
      }
    }
    if (ampm) {
      const isPm = ampm === 'pm';
      hh = ((hh % 12) + (isPm ? 12 : 0)) % 24;
    }
    hh = clamp(hh, 0, 23);
    mm = clamp(mm, 0, 59);
    return { valid: !Number.isNaN(hh) && !Number.isNaN(mm), hh, mm };
  };

  const commit = (raw: string) => {
    const { valid, hh, mm } = parseText(raw);
    if (!valid) return;
    const v = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    onValueChange(v);
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value || '';
    setInternal(raw);
    commit(raw);
  };

  const commonKeep = keepPopoverAttr ? { 'data-calendar-keep-popover': 'true' } : {};

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        sizeVariant === 'sm' ? 'h-8' : sizeVariant === 'lg' ? 'h-12' : 'h-10'
      )}
    >
      {/* Hide the native time picker indicator */}
      <style>
        {`
        input[data-hide-time-indicator="true"]::-webkit-calendar-picker-indicator { display: none; }
        input[data-hide-time-indicator="true"]::-webkit-clear-button { display: none; }
      `}
      </style>
      <Input
        // Before `rest`, so a caller can name the field ("Start time").
        aria-label="Time"
        {...rest}
        {...commonKeep}
        type="time"
        className={cn('w-[140px] appearance-none bg-background', className)}
        value={internal}
        onChange={handleNativeChange}
        // Minutes are the finest unit; a step under 60 adds a seconds field.
        step={60}
        disabled={disabled}
        sizeVariant={sizeVariant}
        data-hide-time-indicator="true"
      />
    </div>
  );
};

export default TimeInput;
