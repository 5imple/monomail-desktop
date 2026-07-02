import { apiClient, isBackendConfigured } from '@/main/api/apiClient';
import { FeedbackRequest } from '@/main/api/feedback/types';

/**
 * Add a new bookmark for a specific account.
 * @param {FeedbackRequest} bookmark - The bookmark data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the bookmark is successfully added.
 */
const postFeedback = (feedback: FeedbackRequest, signal?: AbortSignal) => {
  // Standalone: feedback submission is a backend-only feature. Reject with a
  // clear error rather than silently no-op, so the caller's existing
  // error-toast path surfaces it instead of showing a false success.
  if (!isBackendConfigured()) {
    return Promise.reject(new Error('Feedback is unavailable: no backend configured.'));
  }

  const formData = new FormData();

  formData.append('category', feedback.category);
  formData.append('content', feedback.content);

  if (feedback.attachments) {
    feedback.attachments.forEach((file) => formData.append('attachment', file));
  }
  return apiClient.post<void>(`/mono/feedback/create`, formData, {
    signal
  });
};

export default { postFeedback };
