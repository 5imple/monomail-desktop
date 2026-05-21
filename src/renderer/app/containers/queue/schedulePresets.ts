/**
 * Schedule preset definitions for the Later Queue (P8 piece 2 + 5).
 *
 * Mirrors emailClientv1's preset shape so the Reschedule/Send-Later
 * popover renders against a consistent set of options. `scheduledFor`
 * is computed lazily from `now` because the presets are relative
 * ("Tomorrow morning") and need to recompute on each open.
 */

export interface SchedulePreset {
  id: string;
  label: string;
  sublabel?: string;
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

  return [
    { id: 'in-1-hour', label: 'In 1 hour', scheduledFor: inOneHour.toISOString() },
    laterToday > now
      ? { id: 'later-today', label: 'Later today', scheduledFor: laterToday.toISOString() }
      : null,
    {
      id: 'tomorrow-morning',
      label: 'Tomorrow morning',
      scheduledFor: tomorrowMorning.toISOString()
    },
    { id: 'this-weekend', label: 'This weekend', scheduledFor: weekend.toISOString() },
    { id: 'next-week', label: 'Next Monday', scheduledFor: nextMonday(now).toISOString() },
    { id: 'custom', label: 'Pick a date…', sublabel: 'Open the calendar', scheduledFor: null }
  ].filter((p): p is SchedulePreset => p !== null);
}
