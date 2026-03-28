import { apiClient } from '@/main/api/apiClient';
import { TrackingHistoriesResponse } from './types';

/**
 * Get tracking histories for all account UIDs
 * @returns {Promise<TrackingHistoriesResponse>} - Returns record of account UID to tracking history arrays
 */
const getTrackingHistories = (): Promise<TrackingHistoriesResponse> => {
  return apiClient.get<TrackingHistoriesResponse>('/track/histories');
};

export default {
  getTrackingHistories
};
