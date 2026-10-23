import { queueApi } from '@/main/api/queue/queueApi';
import type {
  CreateScheduleRequest,
  CreateSnoozeRequest
} from '@/main/api/queue/types';
import { schedulerService } from '@/main/services/scheduler/SchedulerService';
import { ipcMain } from 'electron';
import log from 'electron-log';

/**
 * Piece 4 — IPC bridge for the P8 Later Queue. Renderer calls these
 * channels via the preload bridge; main wraps responses in
 * `{ ok, data? | error? }` so the renderer doesn't have to handle
 * rejections directly.
 *
 * Snooze runs on the local SchedulerService: it moves the thread out of the
 * inbox now and back at snoozeUntil (sending THREAD_UNSNOOZED on
 * `renderer:queue:event`), with no server. It went to queueApi (HTTP) here,
 * so with no backend running every snooze failed with "fetch failed".
 * Scheduled send still goes to queueApi: the local scheduler needs the built
 * raw message, which the renderer doesn't send, and only sends from Gmail.
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
    wrap(() => queueApi.createSchedule(req))
  );

  ipcMain.handle('main:queue:list-scheduled', (_, accountId: string) =>
    wrap(() => queueApi.listSchedules(accountId))
  );

  ipcMain.handle('main:queue:cancel-schedule', (_, scheduleId: string) =>
    wrap(() => queueApi.cancelSchedule(scheduleId))
  );

  ipcMain.handle(
    'main:queue:reschedule-send',
    (_, args: { scheduleId: string; sendAt: string }) =>
      wrap(() => queueApi.rescheduleSend(args.scheduleId, args.sendAt))
  );

  ipcMain.handle('main:queue:send-now', (_, scheduleId: string) =>
    wrap(() => queueApi.sendScheduledNow(scheduleId))
  );
}
