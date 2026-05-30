import type {
  CreateScheduleRequest,
  CreateSnoozeRequest,
  DraftSnapshot,
  ScheduleRecord,
  SnoozeRecord,
  ThreadSnapshot
} from '@/main/api/queue/types';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { notificationManager } from '@/main/services/notification/NotificationManager';
import { findOrCreateLabel, modifyThread, sendRawMessage } from '@/main/services/scheduler/gmailMain';
import { generateUUID } from '@/main/utils';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

// Local replacement for the backend "Later Queue". Snooze / scheduled-send /
// reminders are persisted in electron-store and fired by a periodic sweep, so
// they survive restarts and tolerate long delays (best-effort while the app is
// running — the documented limitation of a no-server scheduler).
//
// Increment 1 implements snooze (label-based, reversible). Scheduled-send and
// reminders are added next.

const SWEEP_INTERVAL_MS = 30_000;
const SNOOZE_LABEL_NAME = 'Snoozed';
// Cap retries so a permanently-failing scheduled send (e.g. revoked token)
// stops re-attempting instead of sending on every sweep forever.
const MAX_SEND_ATTEMPTS = 3;

interface SnoozeTask {
  snoozeId: string;
  accountId: string;
  threadId: string;
  snoozeUntil: string; // ISO 8601
  createdAt: string; // ISO 8601
  threadSnapshot: ThreadSnapshot;
  snoozedLabelId?: string; // the label applied, to remove on un-snooze
}

interface ReminderTask {
  reminderId: string;
  accountId: string;
  threadId: string;
  subject: string;
  reminderAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

interface ScheduleTask {
  scheduleId: string;
  accountId: string;
  raw: string; // base64url RFC822, built by the renderer at schedule time
  sendAt: string; // ISO 8601
  draftId: string;
  threadId?: string;
  draftSnapshot: DraftSnapshot;
  createdAt: string; // ISO 8601
  status: 'pending' | 'sending' | 'failed';
  attempts: number;
}

interface SchedulerStoreSchema {
  snoozes?: Record<string, SnoozeTask>;
  reminders?: Record<string, ReminderTask>;
  schedules?: Record<string, ScheduleTask>;
}

const EMPTY_THREAD_SNAPSHOT: ThreadSnapshot = {
  subject: '',
  snippet: '',
  from: { id: '', name: '', email: '' },
  isStarred: false
};

const EMPTY_DRAFT_SNAPSHOT: DraftSnapshot = {
  subject: '',
  bodySnippet: '',
  recipients: [],
  attachmentCount: 0,
  isReply: false
};

class SchedulerService {
  private static instance: SchedulerService;
  private store: Store<SchedulerStoreSchema>;
  private sweepTimer?: ReturnType<typeof setInterval>;
  private labelIdByAccount = new Map<string, string>();

  private constructor() {
    this.store = new Store<SchedulerStoreSchema>({ name: 'scheduler' });
    // Drop all queued items on sign-out — they belong to the signed-out user.
    tokenManager.on('signed-out', () => {
      // Keep snoozes: a snoozed thread sits out of the inbox under a "Snoozed"
      // label, so clearing the record would strand it (never restored). Leaving
      // it lets the sweep restore it at snoozeUntil once the account reconnects.
      // Reminders/schedules are forward actions that shouldn't fire post-sign-out.
      this.store.set('reminders', {});
      this.store.set('schedules', {});
      this.labelIdByAccount.clear();
    });
  }

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /** Called once on app bootstrap. The sweep both fires due items and re-arms
   *  anything that came due while the app was closed. */
  start(): void {
    if (this.sweepTimer) return;
    log.info(
      '[scheduler] started — sweeping every %ds (%d snooze, %d reminder, %d scheduled-send pending)',
      SWEEP_INTERVAL_MS / 1000,
      Object.keys(this.getSnoozes()).length,
      Object.keys(this.getReminders()).length,
      Object.keys(this.getSchedules()).length
    );
    this.recoverStuckSchedules();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    void this.sweep();
  }

  /** Crash recovery: a schedule left 'sending' means a prior run set the guard
   *  but exited before the send resolved. We can't know whether it actually went
   *  out, so we don't auto-resend (that would risk a duplicate) — we drop it and
   *  notify the user to verify, rather than leave it stuck forever. */
  private recoverStuckSchedules(): void {
    for (const task of Object.values(this.getSchedules())) {
      if (task.status !== 'sending') continue;
      log.warn('[scheduler] schedule %s stuck "sending" after restart — dropping', task.scheduleId);
      this.removeSchedule(task.scheduleId);
      try {
        notificationManager.createNativeNotification({
          id: `schedule-stuck-${task.scheduleId}`,
          title: 'Scheduled send may not have completed',
          body:
            task.draftSnapshot.subject ||
            'A scheduled email was interrupted — please check your Sent folder.',
          metadata: { scheduleId: task.scheduleId, accountId: task.accountId }
        });
      } catch {
        /* notification is best-effort */
      }
    }
  }

  // ── snooze ──────────────────────────────────────────────────────────────

  async createSnooze(req: CreateSnoozeRequest): Promise<SnoozeRecord> {
    const labelId = await this.getSnoozeLabelId(req.accountId);
    // Move the thread out of the inbox and tag it as snoozed.
    await modifyThread(req.accountId, req.threadId, [labelId], ['INBOX']);
    log.info('[scheduler] snoozed thread %s until %s', req.threadId, req.snoozeUntil);

    const task: SnoozeTask = {
      snoozeId: generateUUID(),
      accountId: req.accountId,
      threadId: req.threadId,
      snoozeUntil: req.snoozeUntil,
      createdAt: new Date().toISOString(),
      threadSnapshot: req.threadSnapshot ?? EMPTY_THREAD_SNAPSHOT,
      snoozedLabelId: labelId
    };
    this.setSnoozes({ ...this.getSnoozes(), [task.snoozeId]: task });
    return this.toSnoozeRecord(task);
  }

  /** User-initiated un-snooze: restore to inbox now. */
  async unsnooze(snoozeId: string): Promise<{ ok: boolean }> {
    const task = this.getSnoozes()[snoozeId];
    if (task) {
      await this.restoreToInbox(task);
      this.removeSnooze(snoozeId);
    }
    return { ok: true };
  }

  async rescheduleSnooze(snoozeId: string, snoozeUntil: string): Promise<SnoozeRecord> {
    const snoozes = this.getSnoozes();
    const task = snoozes[snoozeId];
    if (!task) throw new Error('Snooze not found');
    const updated: SnoozeTask = { ...task, snoozeUntil };
    this.setSnoozes({ ...snoozes, [snoozeId]: updated });
    return this.toSnoozeRecord(updated);
  }

  listSnoozes(accountId: string): { items: SnoozeRecord[] } {
    const items = Object.values(this.getSnoozes())
      .filter((task) => task.accountId === accountId)
      .map((task) => this.toSnoozeRecord(task));
    return { items };
  }

  // ── reminders ─────────────────────────────────────────────────────────────

  createReminder(req: {
    uid: string;
    threadId: string;
    subject?: string;
    reminderAt: string;
  }): { id: string } {
    const task: ReminderTask = {
      reminderId: generateUUID(),
      accountId: req.uid,
      threadId: req.threadId,
      subject: req.subject ?? '',
      reminderAt: req.reminderAt,
      createdAt: new Date().toISOString()
    };
    this.setReminders({ ...this.getReminders(), [task.reminderId]: task });
    log.info('[scheduler] reminder set for thread %s at %s', task.threadId, task.reminderAt);
    return { id: task.reminderId };
  }

  listReminders(): { items: ReminderTask[] } {
    return { items: Object.values(this.getReminders()) };
  }

  deleteReminder(reminderId: string): { ok: boolean } {
    const reminders = this.getReminders();
    delete reminders[reminderId];
    this.setReminders(reminders);
    return { ok: true };
  }

  // ── scheduled send ────────────────────────────────────────────────────────

  async createSchedule(req: CreateScheduleRequest): Promise<ScheduleRecord> {
    if (!req.raw) {
      throw new Error('createSchedule requires a built raw message (renderer must supply it)');
    }
    const task: ScheduleTask = {
      scheduleId: generateUUID(),
      accountId: req.accountId,
      raw: req.raw,
      sendAt: req.sendAt,
      draftId: req.draftId,
      threadId: req.threadId,
      draftSnapshot: req.draftSnapshot ?? EMPTY_DRAFT_SNAPSHOT,
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    };
    this.setSchedules({ ...this.getSchedules(), [task.scheduleId]: task });
    log.info('[scheduler] scheduled send %s for %s', task.scheduleId, task.sendAt);
    return this.toScheduleRecord(task);
  }

  listSchedules(accountId: string): { items: ScheduleRecord[] } {
    const items = Object.values(this.getSchedules())
      .filter((task) => task.accountId === accountId)
      .map((task) => this.toScheduleRecord(task));
    return { items };
  }

  cancelSchedule(scheduleId: string): { ok: boolean } {
    this.removeSchedule(scheduleId);
    log.info('[scheduler] cancelled scheduled send %s', scheduleId);
    return { ok: true };
  }

  async rescheduleSend(scheduleId: string, sendAt: string): Promise<ScheduleRecord> {
    const schedules = this.getSchedules();
    const task = schedules[scheduleId];
    if (!task) throw new Error('Schedule not found');
    const updated: ScheduleTask = { ...task, sendAt, status: 'pending', attempts: 0 };
    this.setSchedules({ ...schedules, [scheduleId]: updated });
    return this.toScheduleRecord(updated);
  }

  async sendScheduledNow(scheduleId: string): Promise<{ ok: boolean; messageId: string }> {
    const task = this.getSchedules()[scheduleId];
    if (!task) throw new Error('Schedule not found');
    const sent = await sendRawMessage(task.accountId, task.raw, task.threadId);
    this.removeSchedule(scheduleId);
    this.emit({ type: 'SCHEDULED_SENT', scheduleId, messageId: sent.id });
    log.info('[scheduler] sent scheduled message %s now (gmail id %s)', scheduleId, sent.id);
    return { ok: true, messageId: sent.id };
  }

  // ── sweep ───────────────────────────────────────────────────────────────

  private async sweep(): Promise<void> {
    const now = Date.now();
    const connectedUids = new Set(tokenManager.getGoogleAccounts().map((a) => a.uid));
    for (const task of Object.values(this.getSnoozes())) {
      if (new Date(task.snoozeUntil).getTime() > now) continue;
      // Skip silently when the account isn't connected (signed out): we can't reach
      // Gmail to restore the thread, so wait for reconnect rather than retrying and
      // warning every sweep. It un-snoozes once the account is back.
      if (!connectedUids.has(task.accountId)) continue;
      try {
        log.info('[scheduler] un-snoozing thread %s (due)', task.threadId);
        await this.restoreToInbox(task);
        this.removeSnooze(task.snoozeId);
        this.emit({ type: 'THREAD_UNSNOOZED', snoozeId: task.snoozeId });
      } catch (e) {
        // Leave the task in place; the next sweep retries.
        log.warn('[scheduler] un-snooze sweep failed for %s:', task.snoozeId, (e as Error).message);
      }
    }

    for (const reminder of Object.values(this.getReminders())) {
      if (new Date(reminder.reminderAt).getTime() > now) continue;
      try {
        log.info('[scheduler] firing reminder %s (thread %s)', reminder.reminderId, reminder.threadId);
        notificationManager.createNativeNotification({
          id: `reminder-${reminder.reminderId}`,
          title: 'Reminder',
          body: reminder.subject || 'You have a reminder',
          metadata: { threadId: reminder.threadId, accountId: reminder.accountId }
        });
        this.removeReminder(reminder.reminderId);
      } catch (e) {
        log.warn('[scheduler] reminder sweep failed for %s:', reminder.reminderId, (e as Error).message);
      }
    }

    for (const task of Object.values(this.getSchedules())) {
      if (task.status === 'sending' || task.status === 'failed') continue;
      if (new Date(task.sendAt).getTime() > now) continue;
      // Send-once guard: mark 'sending' and persist before the await so an
      // overlapping sweep cannot dispatch the same message twice.
      this.setSchedules({
        ...this.getSchedules(),
        [task.scheduleId]: { ...task, status: 'sending' }
      });
      try {
        log.info('[scheduler] sending scheduled message %s (due)', task.scheduleId);
        const sent = await sendRawMessage(task.accountId, task.raw, task.threadId);
        this.removeSchedule(task.scheduleId);
        this.emit({ type: 'SCHEDULED_SENT', scheduleId: task.scheduleId, messageId: sent.id });
      } catch (e) {
        const attempts = task.attempts + 1;
        const message = (e as Error).message;
        log.warn(
          '[scheduler] scheduled send %s failed (attempt %d/%d): %s',
          task.scheduleId,
          attempts,
          MAX_SEND_ATTEMPTS,
          message
        );
        if (attempts >= MAX_SEND_ATTEMPTS) {
          // Give up: remove it so it doesn't linger as a dead row that looks
          // pending, and surface the failure so the user can resend.
          this.removeSchedule(task.scheduleId);
          this.emit({ type: 'SCHEDULE_FAILED', scheduleId: task.scheduleId, error: message });
        } else {
          // Retry on a later sweep — back to 'pending'.
          this.setSchedules({
            ...this.getSchedules(),
            [task.scheduleId]: { ...task, status: 'pending', attempts }
          });
        }
      }
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async getSnoozeLabelId(uid: string): Promise<string> {
    const cached = this.labelIdByAccount.get(uid);
    if (cached) return cached;
    const id = await findOrCreateLabel(uid, SNOOZE_LABEL_NAME);
    this.labelIdByAccount.set(uid, id);
    return id;
  }

  private async restoreToInbox(task: SnoozeTask): Promise<void> {
    await modifyThread(
      task.accountId,
      task.threadId,
      ['INBOX'],
      task.snoozedLabelId ? [task.snoozedLabelId] : []
    );
  }

  private getSnoozes(): Record<string, SnoozeTask> {
    return this.store.get('snoozes', {});
  }

  private setSnoozes(snoozes: Record<string, SnoozeTask>): void {
    this.store.set('snoozes', snoozes);
  }

  private removeSnooze(snoozeId: string): void {
    const snoozes = this.getSnoozes();
    delete snoozes[snoozeId];
    this.setSnoozes(snoozes);
  }

  private getReminders(): Record<string, ReminderTask> {
    return this.store.get('reminders', {});
  }

  private setReminders(reminders: Record<string, ReminderTask>): void {
    this.store.set('reminders', reminders);
  }

  private removeReminder(reminderId: string): void {
    const reminders = this.getReminders();
    delete reminders[reminderId];
    this.setReminders(reminders);
  }

  private getSchedules(): Record<string, ScheduleTask> {
    return this.store.get('schedules', {});
  }

  private setSchedules(schedules: Record<string, ScheduleTask>): void {
    this.store.set('schedules', schedules);
  }

  private removeSchedule(scheduleId: string): void {
    const schedules = this.getSchedules();
    delete schedules[scheduleId];
    this.setSchedules(schedules);
  }

  private toScheduleRecord(task: ScheduleTask): ScheduleRecord {
    return {
      scheduleId: task.scheduleId,
      draftId: task.draftId,
      accountId: task.accountId,
      sendAt: task.sendAt,
      createdAt: task.createdAt,
      draftSnapshot: task.draftSnapshot
    };
  }

  private toSnoozeRecord(task: SnoozeTask): SnoozeRecord {
    return {
      snoozeId: task.snoozeId,
      threadId: task.threadId,
      accountId: task.accountId,
      snoozeUntil: task.snoozeUntil,
      createdAt: task.createdAt,
      threadSnapshot: task.threadSnapshot
    };
  }

  private emit(event: Record<string, unknown>): void {
    // Send to a single window — the main one, or the first live window if main is
    // closed. (Broadcasting to all windows caused duplicate toasts and races on the
    // shared, IndexedDB-persisted queue cache.)
    const target =
      windowManager.getMainAppWindow() ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (target && !target.isDestroyed()) {
      target.webContents.send('renderer:queue:event', event);
    }
  }
}

export const schedulerService = SchedulerService.getInstance();
