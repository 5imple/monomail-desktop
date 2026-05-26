import { schedulerService } from '@/main/services/scheduler/SchedulerService';
import type {
  CreateScheduleRequest,
  CreateSnoozeRequest
} from '@/main/api/queue/types';
import { ipcMain } from 'electron';
import log from 'electron-log';

/**
 * Piece 4 — IPC bridge for the P8 Later Queue. Renderer calls these
 * channels via the preload bridge; main forwards to queueApi (HTTP) and
 * wraps responses in `{ ok, data? | error? }` so the renderer doesn't
 * have to handle axios-style rejections directly. Push-driven cache
 * updates (THREAD_UNSNOOZED, SCHEDULED_SENT) flow back through the
 * existing WebSocketPushClient, not through these channels.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('[queue] IPC call failed:', message);
      return { ok: false as const, error: message };
    });
}

export function registerQueueHandlers() {
  ipcMain.handle('main:queue:snooze', (_, req: CreateSnoozeRequest) =>
    wrap(() => schedulerService.createSnooze(req))
  );

  ipcMain.handle('main:queue:list-snoozed', (_, accountId: string) =>
    wrap(async () => schedulerService.listSnoozes(accountId))
  );

  ipcMain.handle('main:queue:unsnooze', (_, snoozeId: string) =>
    wrap(() => schedulerService.unsnooze(snoozeId))
  );

  ipcMain.handle(
    'main:queue:reschedule-snooze',
    (_, args: { snoozeId: string; snoozeUntil: string }) =>
      wrap(() => schedulerService.rescheduleSnooze(args.snoozeId, args.snoozeUntil))
  );

  ipcMain.handle('main:queue:schedule', (_, req: CreateScheduleRequest) =>
    wrap(() => schedulerService.createSchedule(req))
  );

  ipcMain.handle('main:queue:list-scheduled', (_, accountId: string) =>
    wrap(async () => schedulerService.listSchedules(accountId))
  );

  ipcMain.handle('main:queue:cancel-schedule', (_, scheduleId: string) =>
    wrap(async () => schedulerService.cancelSchedule(scheduleId))
  );

  ipcMain.handle(
    'main:queue:reschedule-send',
    (_, args: { scheduleId: string; sendAt: string }) =>
      wrap(() => schedulerService.rescheduleSend(args.scheduleId, args.sendAt))
  );

  ipcMain.handle('main:queue:send-now', (_, scheduleId: string) =>
    wrap(() => schedulerService.sendScheduledNow(scheduleId))
  );

  // ── reminders (local scheduler) ──
  ipcMain.handle(
    'main:reminder:create',
    (_, req: { uid: string; threadId: string; subject?: string; reminderAt: string }) =>
      wrap(async () => schedulerService.createReminder(req))
  );
  ipcMain.handle('main:reminder:list', () => wrap(async () => schedulerService.listReminders()));
  ipcMain.handle('main:reminder:delete', (_, reminderId: string) =>
    wrap(async () => schedulerService.deleteReminder(reminderId))
  );
}
