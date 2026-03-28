import { apiClient } from '@/main/api/apiClient';
import gmailReminderApi from '@/main/api/gmail/reminder';

export interface Reminder {
  id: string;
  threadId: string;
  reminderAt: string;
}

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

const getReminders = () => {
  return apiClient.get<Reminder[]>('/mono/reminders');
};

const deleteReminder = (uid: string, reminderId: string) => {
  return apiClient.delete<void>(`/mono/reminders/${reminderId}`, { uid });
};

export default { createReminder, getReminders, deleteReminder };
