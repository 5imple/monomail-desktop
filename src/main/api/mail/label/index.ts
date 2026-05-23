import { gmailApiClient } from '@/main/api/apiClient';
import {
  MailLabel,
  MailLabelCreateResponse,
  MailLabelListResponse,
  MailLabelUpdateResponse,
} from '@/main/api/mail/types';
import { RawGmailLabel, RawGmailLabelListResponse } from '@/main/api/mail/transforms';

const toMailLabel = (raw: RawGmailLabel): MailLabel => ({
  id: raw.id,
  name: raw.name,
  color: raw.color ?? {},
});

// uid is required for standalone Gmail — it becomes the key in the response map.
// Pass accounts.map(a => a.uid) from the caller for multi-account support.
const getLabels = async (uid: string, signal?: AbortSignal): Promise<MailLabelListResponse> => {
  const raw = await gmailApiClient.get<RawGmailLabelListResponse>('/labels', { signal, uid });
  return {
    labels: { [uid]: (raw.labels ?? []).map(toMailLabel) },
  };
};

const createLabel = async (
  uid: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
): Promise<MailLabelCreateResponse> => {
  return gmailApiClient.post<MailLabelCreateResponse>(
    '/labels',
    { name, color: backgroundColor || textColor ? { backgroundColor, textColor } : undefined },
    { signal, uid }
  );
};

const getLabelById = async (
  uid: string,
  labelId: string,
  signal?: AbortSignal
): Promise<MailLabel> => {
  const raw = await gmailApiClient.get<RawGmailLabel>(`/labels/${labelId}`, { signal, uid });
  return toMailLabel(raw);
};

const updateLabel = async (
  uid: string,
  labelId: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
): Promise<MailLabelUpdateResponse> => {
  return gmailApiClient.patch<MailLabelUpdateResponse>(
    `/labels/${labelId}`,
    { name, color: backgroundColor || textColor ? { backgroundColor, textColor } : undefined },
    { signal, uid }
  );
};

const deleteLabel = async (uid: string, labelId: string, signal?: AbortSignal): Promise<void> => {
  return gmailApiClient.delete<void>(`/labels/${labelId}`, { signal, uid });
};

export default { getLabels, createLabel, getLabelById, updateLabel, deleteLabel };
