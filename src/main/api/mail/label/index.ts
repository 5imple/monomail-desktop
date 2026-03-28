import { apiClient } from '@/main/api/apiClient';
import {
  MailLabel,
  MailLabelCreateResponse,
  MailLabelListResponse,
  MailLabelUpdateResponse
} from '@/main/api/mail/types';

const getLabels = async (signal?: AbortSignal) => {
  return await apiClient.get<MailLabelListResponse>('/mail/labels', { signal });
};

const createLabel = async (
  uid: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
) => {
  return await apiClient.post<MailLabelCreateResponse>(
    '/mail/labels',
    { name, backgroundColor, textColor },
    { signal, uid }
  );
};

const getLabelById = async (uid: string, labelId: string, signal?: AbortSignal) => {
  return await apiClient.get<MailLabel>(`/mail/labels/${labelId}`, { signal, uid });
};

const updateLabel = async (
  uid: string,
  labelId: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
) => {
  return await apiClient.patch<MailLabelUpdateResponse>(
    `/mail/labels/${labelId}`,
    { name, textColor, backgroundColor },
    { signal, uid }
  );
};

const deleteLabel = async (uid: string, labelId: string, signal?: AbortSignal) => {
  return await apiClient.delete<void>(`/mail/labels/${labelId}`, { signal, uid });
};

export default { getLabels, createLabel, getLabelById, updateLabel, deleteLabel };
