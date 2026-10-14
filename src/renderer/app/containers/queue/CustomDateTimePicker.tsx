import { useState } from 'react';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Calendar } from '@/renderer/app/components/ui/calendar';
import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';

/**
 * Custom date + time picker shown when the user chooses "Pick a date…" in the
 * snooze / send-later popover. Renders the calendar inline (not in a nested
 * popover) so interacting with it doesn't close the parent popover, then hands
 * the combined date+time back to the caller as an ISO string via `onConfirm`.
 */

function plusOneHour(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface CustomDateTimePickerProps {
  heading?: string;
  confirmLabel?: string;
  onConfirm: (iso: string) => void;
  onBack: () => void;
}

export function CustomDateTimePicker({
  heading = 'Pick a date',
  confirmLabel = 'Set',
  onConfirm,
  onBack
}: CustomDateTimePickerProps) {
  const [initial] = useState(plusOneHour);
  const [date, setDate] = useState<Date>(initial);
  const [time, setTime] = useState<string>(toTimeInput(initial));

  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  const when = new Date(date);
  when.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  const isPast = when.getTime() <= Date.now();

  return (
    // The presets' width (300px), so the popover doesn't jump narrower when
    // this opens, and theme tokens instead of raw white/stone.
    <div className="w-[300px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to presets"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <MonoIcon type="ChevronLeft" size={16} weight={300} />
        </button>
        <p className="text-xs font-medium text-muted-foreground">{heading}</p>
      </div>
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => d && setDate(d)}
        disabled={{ before: new Date() }}
        className="mx-auto w-fit"
        initialFocus
      />
      <div className="flex items-center gap-2 border-t p-3">
        {/* The shared input: same height as the button beside it, and the
            native clock drawn for the theme (it was black on the dark field). */}
        <Input
          type="time"
          sizeVariant="sm"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isPast) {
              e.preventDefault();
              onConfirm(when.toISOString());
            }
          }}
          className="flex-1 tabular-nums [color-scheme:light] focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark]"
        />
        <Button sizeVariant="sm" disabled={isPast} onClick={() => onConfirm(when.toISOString())}>
          {isPast ? 'Pick a later time' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export default CustomDateTimePicker;
