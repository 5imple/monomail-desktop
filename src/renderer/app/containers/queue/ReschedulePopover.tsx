import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
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
    // Theme tokens, like the Label menu beside it (raw white/stone before).
    <div
      role="menu"
      className="w-[300px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      <div className="border-b px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">{heading}</p>
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
                  'group/preset flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted-low focus:bg-muted-low focus:outline-none'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium tracking-tight text-foreground">
                    {preset.label}
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {isCustom ? preset.sublabel : formatPresetTime(preset.scheduledFor)}
                  </div>
                </div>
                <MonoIcon
                  type="ChevronRight"
                  size={16}
                  weight={300}
                  className="shrink-0 text-muted-foreground/40 transition-transform group-hover/preset:translate-x-0.5 group-hover/preset:text-foreground"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
