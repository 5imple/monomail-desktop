import { apiClient } from '@/main/api/apiClient';
import {
  MailDraft,
  MailDraftCreateResponse,
  MailDraftListResponse,
  MailDraftUpdateResponse
} from '@/main/api/mail/types';
import { IMonoDraft } from '@/main/models/draft/MonoDraft';

const getDrafts = async (signal?: AbortSignal) => {
  return await apiClient.get<MailDraftListResponse>(`/mail/drafts`, { signal });
};

const createDraft = (uid: string, draftData: IMonoDraft, signal?: AbortSignal) => {
  const formData = new FormData();
  formData.append('to', draftData.to.join(','));
  draftData.cc.length > 0 && formData.append('cc', draftData.cc.join(','));
  draftData.bcc.length > 0 && formData.append('bcc', draftData.bcc.join(','));
  formData.append('subject', draftData.subject);
  formData.append('body', draftData.body);
  draftData.messageId && formData.append('messageId', draftData.messageId);
  draftData.threadId && formData.append('threadId', draftData.threadId);

  return apiClient.post<MailDraftCreateResponse>('/mail/drafts', formData, {
    signal,
    uid
  });
};

const getDraftById = async (uid: string, draftId: string, signal?: AbortSignal) => {
  return await apiClient.get<MailDraft>(`/mail/drafts/${draftId}`, { signal, uid });
};

const updateDraft = (uid: string, draftData: IMonoDraft, signal?: AbortSignal) => {
  return apiClient.patch<MailDraftUpdateResponse>(`/mail/drafts/${draftData.id}`, draftData, {
    signal,
    uid
  });
};

const deleteDraft = async (uid: string, draftId: string, signal?: AbortSignal) => {
  return await apiClient.patch<void>(`/mail/drafts/${draftId}/delete`, { signal, uid });
};

export default { getDrafts, createDraft, getDraftById, updateDraft, deleteDraft };
