import { DBGetThreadCountByLabels } from '@/renderer/app/lib/db/thread';
import electronApi from '@/renderer/app/lib/electronApi';

export async function updateBadgeWithLabelCount(
  accountIds: string[],
  labelIds: string[] = ['PRIMARY', 'UNREAD']
) {
  try {
    // Use Promise.all to wait for all count requests to complete
    const countPromises = accountIds.map(async (accountId) => {
      try {
        const result = await DBGetThreadCountByLabels(accountId, labelIds);

        return result;
      } catch (error) {
        console.error(`Failed to get thread count for account ${accountId}:`, error);
        return 0;
      }
    });

    // Wait for all promises to resolve and sum the results
    const counts = await Promise.all(countPromises);
    const totalCount = counts.reduce((sum, count) => sum + count, 0);
    // Only set badge if count is greater than 0
    if (totalCount > 0) {
      electronApi.setBadgeCount(totalCount);
    } else {
      // Optional: Clear the badge if count is 0
      electronApi.setBadgeCount(0);
    }
  } catch (error) {
    console.error('Error calculating badge count:', error);
  }
}
