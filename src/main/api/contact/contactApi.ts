import { apiClient } from '@/main/api/apiClient';
import { GoogleContactResponse } from '@/main/api/contact/types';
import { Contact } from '@/renderer/app/lib/db/contact';

interface ContactListResponse {
  contacts: Contact[];
  currentPage: number;
  totalPages: number;
  totalElements: number;
}

const getMonoContactList = (signal?: AbortSignal) => {
  return apiClient.get<ContactListResponse>(`/mono/contact`, {
    signal
  });
};

const getGoogleContact = (signal?: AbortSignal) => {
  return apiClient.get<GoogleContactResponse>(`/mono/contact/google`, {
    signal
  });
};

const createMonoContact = (data: Contact, signal?: AbortSignal) => {
  return apiClient.post(`/mono/contact`, data, { signal });
};

const deleteMonoContact = (id: string, signal?: AbortSignal) => {
  return apiClient.delete(`/mono/contact/${id}`, { signal });
};

interface PinnedEmailResponse {
  uid: string;
  pinnedEmails: string[];
}

// Fetch Pinned Emails
const getPinnedEmails = (signal?: AbortSignal) => {
  return apiClient.get<PinnedEmailResponse>(`/mono/pin`, {
    signal
  });
};

// Add a Pinned Email
const addPinnedEmail = (pinnedEmail: string, signal?: AbortSignal) => {
  return apiClient.post(`/mono/pin`, { pinnedEmail }, { signal });
};

// Remove a Pinned Email
const removePinnedEmail = (pinnedEmail: string, signal?: AbortSignal) => {
  return apiClient.delete(`/mono/pin/${pinnedEmail}`, { signal });
};
// Update Order of Pinned Emails
const updatePinnedEmailOrder = (pinnedEmails: string[], signal?: AbortSignal) => {
  return apiClient.patch(`/mono/pin/order`, pinnedEmails, { signal });
};

export default {
  getGoogleContact,
  getMonoContactList,
  createMonoContact,
  deleteMonoContact,
  getPinnedEmails,
  addPinnedEmail,
  updatePinnedEmailOrder,
  removePinnedEmail
};
