import type { CreateSnoozeRequest, SnoozeRecord, ThreadSnapshot } from '@/main/api/queue/types';
import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { windowManager } from '@/main/services/mangers/window/WindowManager';
import { findOrCreateLabel, modifyThread } from '@/main/services/scheduler/gmailMain';
import { generateUUID } from '@/main/utils';
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

interface SnoozeTask {
  snoozeId: string;
  accountId: string;
  threadId: string;
  snoozeUntil: string; // ISO 8601
  createdAt: string; // ISO 8601
  threadSnapshot: ThreadSnapshot;
  snoozedLabelId?: string; // the label applied, to remove on un-snooze
}

interface SchedulerStoreSchema {
  snoozes?: Record<string, SnoozeTask>;
}

const EMPTY_THREAD_SNAPSHOT: ThreadSnapshot = {
  subject: '',
  snippet: '',
  from: { id: '', name: '', email: '' },
  isStarred: false
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
      this.store.set('snoozes', {});
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
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    void this.sweep();
  }

  // ── snooze ──────────────────────────────────────────────────────────────

  async createSnooze(req: CreateSnoozeRequest): Promise<SnoozeRecord> {
    const labelId = await this.getSnoozeLabelId(req.accountId);
    // Move the thread out of the inbox and tag it as snoozed.
    await modifyThread(req.accountId, req.threadId, [labelId], ['INBOX']);

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

  // ── sweep ───────────────────────────────────────────────────────────────

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const task of Object.values(this.getSnoozes())) {
      if (new Date(task.snoozeUntil).getTime() > now) continue;
      try {
        await this.restoreToInbox(task);
        this.removeSnooze(task.snoozeId);
        this.emit({ type: 'THREAD_UNSNOOZED', snoozeId: task.snoozeId });
      } catch (e) {
        // Leave the task in place; the next sweep retries.
        log.warn('[scheduler] un-snooze sweep failed for %s:', task.snoozeId, (e as Error).message);
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
    const mainWindow = windowManager.getMainAppWindow();
    if (mainWindow) mainWindow.webContents.send('renderer:queue:event', event);
  }
}

export const schedulerService = SchedulerService.getInstance();
