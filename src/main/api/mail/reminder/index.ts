export interface Reminder {
  id: string;
  threadId: string;
  reminderAt: string;
}

// Standalone: reminders are scheduled in the main process (a local OS
// notification fires at reminderAt), not on a backend. This renderer-side
// wrapper talks to the scheduler over the preload bridge. We reach it via
// `(window as any).electronBridge` (like apiClient) rather than importing the
// renderer's electronApi, because this module is also type-checked under the
// main/node tsconfig where `window.electronBridge` isn't declared.

type ReminderResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface ReminderBridge {
  reminderCreate: (req: {
    uid: string;
    threadId: string;
    messageId?: string;
    subject?: string;
    reminderAt: string;
  }) => Promise<ReminderResult<{ id: string }>>;
  reminderList: () => Promise<ReminderResult<{ items: Reminder[] }>>;
  reminderDelete: (reminderId: string) => Promise<ReminderResult<{ ok: boolean }>>;
}

function bridge(): ReminderBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as any).electronBridge as ReminderBridge | undefined;
}

const createReminder = async (args: {
  uid: string;
  threadId: string;
  messageId: string;
  subject: string;
  reminderAt: string;
}): Promise<{ id: string }> => {
  const res = await bridge()?.reminderCreate(args);
  if (!res) throw new Error('Reminder bridge unavailable');
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

const getReminders = async (): Promise<Reminder[]> => {
  const res = await bridge()?.reminderList();
  return res && res.ok ? res.data.items : [];
};

const deleteReminder = async (_uid: string, reminderId: string): Promise<void> => {
  await bridge()?.reminderDelete(reminderId);
};

export default { createReminder, getReminders, deleteReminder };
