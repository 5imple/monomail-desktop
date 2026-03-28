import trackingApi from '@/main/api/tracking/trackingApi';
import { TrackingHistory, TrackingHistoriesResponse } from '@/main/api/tracking/types';
import { trackingHistoriesAtom } from '@/renderer/app/store/tracking/atoms';
import { useAtom } from 'jotai';

export function useTrackingAtom() {
  const [trackingHistories, setTrackingHistories] =
    useAtom<Record<string, Record<string, TrackingHistory[]>>>(trackingHistoriesAtom);

  /**
   * Fetch and set tracking histories for all accounts.
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
   */
  const fetchAndSetTrackingHistories = async (signal?: AbortSignal) => {
    try {
      const response = await trackingApi.getTrackingHistories();
      if (response) {
        setTrackingHistories(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch tracking histories:', error);
    }
  };

  /**
   * Get tracking history for a specific message.
   * @param {string} accountUid - The account UID.
   * @param {string} messageId - The message ID.
   * @returns {TrackingHistory[]} - Array of tracking history for the message.
   */
  const getMessageTrackingHistory = (
    accountUid: string,
    messageId: string
  ): TrackingHistory[] | null => {
    const accountHistories = trackingHistories[accountUid];

    if (!accountHistories) return null;
    return accountHistories[messageId];
  };

  /**
   * Clear all tracking histories.
   */
  const clearTrackingHistories = () => {
    setTrackingHistories({});
  };

  return {
    trackingHistories,
    fetchAndSetTrackingHistories,
    getMessageTrackingHistory,
    clearTrackingHistories
  };
}
