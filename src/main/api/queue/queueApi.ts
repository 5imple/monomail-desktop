import { apiClient } from '@/main/api/apiClient';
import type {
  CreateScheduleRequest,
  CreateSnoozeRequest,
  ListResponse,
  ScheduleRecord,
  SendNowResponse,
  SnoozeRecord,
  SuccessResponse
} from './types';

/**
 * P8 Later Queue HTTP client. Thin wrapper over apiClient; one method
 * per documented endpoint in project_p8_backend_plan.md. Path segments
 * sit under /mail/{snooze,schedule}; apiClient already appends /api/v1.
 */

export const queueApi = {
  createSnooze: (req: CreateSnoozeRequest): Promise<SnoozeRecord> =>
    apiClient.post<SnoozeRecord>('/mail/snooze', req),

  listSnoozes: (accountId: string): Promise<ListResponse<SnoozeRecord>> =>
    apiClient.get<ListResponse<SnoozeRecord>>(
      `/mail/snooze?accountId=${encodeURIComponent(accountId)}`
    ),

  unsnooze: (snoozeId: string): Promise<SuccessResponse> =>
    apiClient.delete<SuccessResponse>(`/mail/snooze/${encodeURIComponent(snoozeId)}`),

  rescheduleSnooze: (snoozeId: string, snoozeUntil: string): Promise<SnoozeRecord> =>
    apiClient.patch<SnoozeRecord>(`/mail/snooze/${encodeURIComponent(snoozeId)}`, {
      snoozeUntil
    }),

  createSchedule: (req: CreateScheduleRequest): Promise<ScheduleRecord> =>
    apiClient.post<ScheduleRecord>('/mail/schedule', req),

  listSchedules: (accountId: string): Promise<ListResponse<ScheduleRecord>> =>
    apiClient.get<ListResponse<ScheduleRecord>>(
      `/mail/schedule?accountId=${encodeURIComponent(accountId)}`
    ),

  cancelSchedule: (scheduleId: string): Promise<SuccessResponse> =>
    apiClient.delete<SuccessResponse>(`/mail/schedule/${encodeURIComponent(scheduleId)}`),

  rescheduleSend: (scheduleId: string, sendAt: string): Promise<ScheduleRecord> =>
    apiClient.patch<ScheduleRecord>(`/mail/schedule/${encodeURIComponent(scheduleId)}`, {
      sendAt
    }),

  sendScheduledNow: (scheduleId: string): Promise<SendNowResponse> =>
    apiClient.post<SendNowResponse>(
      `/mail/schedule/${encodeURIComponent(scheduleId)}/send-now`,
      {}
    )
};

export default queueApi;
