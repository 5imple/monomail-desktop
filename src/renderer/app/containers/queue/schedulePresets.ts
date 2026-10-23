/**
 * Schedule preset definitions for the Later Queue (P8 piece 2 + 5).
 *
 * Mirrors emailClientv1's preset shape so the Reschedule/Send-Later
 * popover renders against a consistent set of options. `scheduledFor`
 * is computed lazily from `now` because the presets are relative
 * ("Tomorrow morning") and need to recompute on each open. The names are
 * en.json keys (`later.preset.*`); the popover translates them.
 */

export interface SchedulePreset {
  id: string;
  /** en.json key of the option's name. */
  labelKey: string;
  /** en.json key of a second line shown in place of a time. */
  sublabelKey?: string;
  scheduledFor: string | null;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function setTime(d: Date, hours: number, minutes = 0): Date {
  const c = new Date(d);
  c.setHours(hours, minutes, 0, 0);
  return c;
}

function nextMonday(now: Date): Date {
  const d = startOfDay(now);
  const day = d.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  return setTime(d, 8);
}

export function buildSchedulePresets(now: Date = new Date()): SchedulePreset[] {
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const laterToday = setTime(now, 18);
  const tomorrowMorning = setTime(new Date(now.getTime() + 24 * 60 * 60 * 1000), 8);
  const weekend = (() => {
    const d = startOfDay(now);
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    return setTime(d, 8);
  })();

  // On a Saturday or Sunday the weekend preset is next Saturday.
  const isWeekend = now.getDay() === 6 || now.getDay() === 0;

  const presets = [
    { id: 'in-1-hour', labelKey: 'later.preset.in_1_hour', scheduledFor: inOneHour.toISOString() },
    // Only when clearly after "In 1 hour": late in the afternoon 6 PM was
    // minutes away, or listed after "In 1 hour" while being earlier.
    laterToday.getTime() - now.getTime() >= 90 * 60 * 1000
      ? {
          id: 'later-today',
          labelKey: 'later.preset.later_today',
          scheduledFor: laterToday.toISOString()
        }
      : null,
    {
      id: 'tomorrow-morning',
      labelKey: 'later.preset.tomorrow_morning',
      scheduledFor: tomorrowMorning.toISOString()
    },
    {
      id: 'this-weekend',
      labelKey: isWeekend ? 'later.preset.next_weekend' : 'later.preset.this_weekend',
      scheduledFor: weekend.toISOString()
    },
    {
      id: 'next-week',
      labelKey: 'later.preset.next_monday',
      scheduledFor: nextMonday(now).toISOString()
    },
    {
      id: 'custom',
      labelKey: 'later.preset.custom',
      sublabelKey: 'later.preset.custom_sublabel',
      scheduledFor: null
    }
  ].filter(Boolean) as SchedulePreset[];

  // Two presets can be the same moment (on Friday "Tomorrow morning" is the
  // weekend; on Sunday it's next Monday): keep the first. The custom entry
  // has no time and always stays.
  return presets.filter(
    (preset, index) =>
      !preset.scheduledFor ||
      presets.findIndex((other) => other.scheduledFor === preset.scheduledFor) === index
  );
}
