import { ChevronRight } from 'lucide-react';
import { cn } from '@/renderer/app/lib/utils';
import type { SchedulePreset } from '@/renderer/app/containers/queue/schedulePresets';

function formatPresetTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  return `${day}  ·  ${time}`;
}

interface ReschedulePopoverProps {
  presets: SchedulePreset[];
  heading?: string;
  onPickPreset?: (preset: SchedulePreset) => void;
  onPickCustom?: () => void;
}

export function ReschedulePopover({
  presets,
  heading = 'Reschedule',
  onPickPreset,
  onPickCustom
}: ReschedulePopoverProps) {
  return (
    <div
      role="menu"
      className="w-[300px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.18),0_4px_12px_-4px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-stone-950 dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)]"
    >
      <div className="border-b border-stone-100 px-4 py-2.5 dark:border-stone-900">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {heading}
        </p>
      </div>
      <ul className="py-1">
        {presets.map((preset) => {
          const isCustom = preset.id === 'custom';
          return (
            <li key={preset.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (isCustom) onPickCustom?.();
                  else onPickPreset?.(preset);
                }}
                className={cn(
                  'group/preset flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-stone-50 focus:bg-stone-50 focus:outline-none dark:hover:bg-stone-900 dark:focus:bg-stone-900'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium tracking-tight text-foreground">
                    {preset.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {isCustom ? preset.sublabel : formatPresetTime(preset.scheduledFor)}
                  </div>
                </div>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-stone-300 transition-transform group-hover/preset:translate-x-0.5 group-hover/preset:text-amber-500 dark:text-stone-700"
                  strokeWidth={2}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
