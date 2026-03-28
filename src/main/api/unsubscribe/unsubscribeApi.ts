// types.ts

// unsubscribeApi.ts
import { apiClient } from '@/main/api/apiClient';
import { UnsubscribeEmailRequest } from './types';

/**
 * Add an email to the unsubscribe list
 * @param {UnsubscribeEmailRequest} emailRequest - The email to unsubscribe
 * @returns {Promise<void>} - Returns nothing
 */
const addUnsubscribedEmail = ({ email }: UnsubscribeEmailRequest): Promise<void> => {
  return apiClient.post('/mono/unsubscribed', { email });
};

/**
 * Check if an email is unsubscribed
 * @param {UnsubscribeEmailRequest} emailRequest - The email to check
 * @returns {Promise<boolean>} - Returns true if email is unsubscribed, false otherwise
 */
const checkUnsubscribedEmail = ({ email }: UnsubscribeEmailRequest): Promise<boolean> => {
  return apiClient.post<boolean>('/mono/unsubscribed/check', { email });
};

/**
 * Get list of all unsubscribed emails
 * @returns {Promise<string[]>} - Returns array of unsubscribed email addresses
 */
const getUnsubscribedEmails = (): Promise<string[]> => {
  return apiClient.get<string[]>('/mono/unsubscribed');
};

export default {
  addUnsubscribedEmail,
  checkUnsubscribedEmail,
  getUnsubscribedEmails
};
