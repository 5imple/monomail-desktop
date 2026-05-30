import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Calendar } from '@/renderer/app/components/ui/calendar';
import { Button } from '@/renderer/app/components/ui/button';

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
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.18)] dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2.5 dark:border-stone-900">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to presets"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {heading}
        </p>
      </div>
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => d && setDate(d)}
        disabled={{ before: new Date() }}
        initialFocus
      />
      <div className="flex items-center gap-2 border-t border-stone-100 p-3 dark:border-stone-900">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-[13px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          sizeVariant="sm"
          disabled={isPast}
          onClick={() => onConfirm(when.toISOString())}
        >
          {isPast ? 'Future time' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export default CustomDateTimePicker;
