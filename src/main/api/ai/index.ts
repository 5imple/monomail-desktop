import { AiReplySuggestionResponse, AiSubjectGenerationResponse } from '@/main/api/ai/types';
import { apiClient } from '@/main/api/apiClient';

/**
 * Get an AI-generated reply suggestion based on email content.
 * @param {string} content - Content of the email.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<AiReplySuggestionResponse>} The AI reply suggestion response.
 */
const getAiReplySuggestion = (content: string, signal?: AbortSignal) => {
  return apiClient.post<AiReplySuggestionResponse>(
    `/ai/suggestions`,
    { content },
    {
      signal
    }
  );
};

/**
 * Generate a simple email template.
 * @param {string} content - The email content to be used as input.
 * @param {string} prompt - The prompt or instruction for the AI model.
 * @param {string} [from] - The from field for accuracy (format: "Name <email>" or just email).
 * @param {string[]} [to] - The to field for accuracy (array of email addresses).
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ template: string }>} The generated email template.
 */
const generateDraft = (
  uid: string,
  content: string,
  prompt: string,
  from?: string,
  to?: string[],
  signal?: AbortSignal
) => {
  // Combine content and prompt into a single request body field
  const requestBody = {
    prompt: prompt,
    content: content,
    ...(from && { from }),
    ...(to && to.length > 0 && { to: to.join(', ') })
  };

  return apiClient.post<{ template: string }>(`/ai/draft`, requestBody, {
    signal,
    uid
  });
};

/**
 * Summarize a thread using AI.
 * @param {string} threadId - The ID of the thread to summarize.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ summary: string }>} The summarized content of the thread.
 */
const summarizeThread = (threadId: string, signal?: AbortSignal) => {
  return apiClient.post<{ summary: string }>(
    `/ai/thread-summarize/${threadId}`,
    {},
    {
      signal
    }
  );
};

/**
 * Generate an AI-generated subject line based on email content.
 * @param {string} content - Content of the email body.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<AiSubjectGenerationResponse>} The AI subject generation response.
 */
const generateSubject = (content: string, signal?: AbortSignal) => {
  return apiClient.post<AiSubjectGenerationResponse>(
    `/ai/subject`,
    { content },
    {
      signal
    }
  );
};

export default { getAiReplySuggestion, generateDraft, summarizeThread, generateSubject };
