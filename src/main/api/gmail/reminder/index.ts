import { apiClient } from '@/main/api/apiClient';

export interface Reminder {
  id: string;
  threadId: string;
  reminderAt: string;
}

/**
 * Create a new reminder.
 * @param {string} threadId - The ID of the thread to associate the reminder with.
 * @param {string} messageId - The ID of the thread to associate the reminder with.
 * @param {string} subject - The ID of the thread to associate the reminder with.
 * @param {string} reminderAt - The timestamp when the reminder should trigger (ISO 8601 format).
 * @returns {Promise<{ id: string }>} The created reminder ID.
 */
const createReminder = ({
  uid,
  threadId,
  messageId,
  subject,
  reminderAt
}: {
  uid: string;
  threadId: string;
  messageId: string;
  subject: string;
  reminderAt: string;
}) => {
  return apiClient.post<{ id: string }>(
    '/mono/reminders',
    {
      threadId,
      // messageId,
      // subject,
      reminderAt
    },
    { uid }
  );
};

/**
 * Get all reminders.
 * @returns {Promise<Reminder[]>} The list of reminders.
 */
const getReminders = () => {
  return apiClient.get<Reminder[]>('/mono/reminders');
};

/**
 * Delete an existing reminder by ID.
 * @param {string} reminderId - The ID of the reminder to delete.
 * @returns {Promise<void>} Resolves when the reminder is successfully deleted.
 */
const deleteReminder = (uid: string, reminderId: string) => {
  return apiClient.delete<void>(`/mono/reminders/${reminderId}`, { uid });
};

export default { createReminder, getReminders, deleteReminder };
