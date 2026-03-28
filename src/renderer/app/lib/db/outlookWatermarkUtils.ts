// Utility functions for testing and debugging Outlook watermark functionality

import {
  getOutlookWatermark,
  saveOutlookWatermark,
  clearOutlookWatermark
} from './outlookWatermark';

/**
 * Debug utility to log all Outlook watermarks for given account IDs
 */
export async function debugOutlookWatermarks(accountIds: string[]): Promise<void> {
  console.log('=== Outlook Watermark Debug Info ===');

  for (const accountId of accountIds) {
    const watermark = await getOutlookWatermark(accountId);
    console.log(
      `Account ${accountId}:`,
      watermark
        ? `historyId=${watermark.historyId}, lastUpdated=${new Date(watermark.lastUpdatedAt).toISOString()}`
        : 'No watermark found'
    );
  }

  console.log('=== End Debug Info ===');
}

/**
 * Test function to simulate Outlook sync scenarios
 */
export async function testOutlookWatermarkFlow(accountId: string): Promise<void> {
  console.log(`Testing Outlook watermark flow for account: ${accountId}`);

  // Test 1: Initial sync (no watermark)
  console.log('Test 1: Initial sync scenario');
  await clearOutlookWatermark(accountId);
  const initialWatermark = await getOutlookWatermark(accountId);
  console.log('Initial watermark (should be null):', initialWatermark);

  // Test 2: Save watermark after initial sync
  console.log('Test 2: Save watermark after initial sync');
  const mockHistoryId = 'mock_initial_history_id_12345';
  await saveOutlookWatermark(accountId, mockHistoryId);
  const savedWatermark = await getOutlookWatermark(accountId);
  console.log('Saved watermark:', savedWatermark);

  // Test 3: Update watermark for incremental sync
  console.log('Test 3: Update watermark for incremental sync');
  const incrementalHistoryId = 'mock_incremental_history_id_67890';
  await saveOutlookWatermark(accountId, incrementalHistoryId);
  const updatedWatermark = await getOutlookWatermark(accountId);
  console.log('Updated watermark:', updatedWatermark);

  // Test 4: Clear watermark (error scenario)
  console.log('Test 4: Clear watermark for error scenario');
  await clearOutlookWatermark(accountId);
  const clearedWatermark = await getOutlookWatermark(accountId);
  console.log('Cleared watermark (should be null):', clearedWatermark);

  console.log('Outlook watermark flow test completed');
}

/**
 * Simulate the client-side Outlook history sync flow for testing
 */
export function simulateOutlookHistorySyncFlow() {
  console.log(`
=== Outlook History Sync Flow Summary ===

Client Behavior:

1. INITIAL SYNC (historyId = null):
   - Read watermark from localStorage: outlook:history:watermark:<accountId>
   - If no watermark found, historyId = null
   - Call: /mail/histories (without historyId parameter)
   - Server returns: messagesAdded events + historyId watermark
   - Save new historyId to localStorage
   - Process all messagesAdded events

2. INCREMENTAL SYNC (historyId provided):
   - Read cached historyId from localStorage
   - Call: /mail/histories?historyId=<cached_watermark>
   - Server returns: delta changes + new historyId watermark
   - Update localStorage with new historyId
   - Process changes:
     * messagesDeleted (items removed)
     * messagesAdded (new items in folder)
     * labelsRemoved (items moved out of folder)
     * labelsAdded (items moved into folder)

3. ERROR HANDLING:
   - 404 error: historyId too old
     * Clear watermark from localStorage
     * Force full sync next time
   - Other errors: retry with exponential backoff

Key Differences from Gmail:
- Gmail: Uses historyId from latest thread
- Outlook: Uses server-issued watermark cached in localStorage
- Outlook: Always update watermark after EVERY successful call
- Outlook: Handle @odata.nextLink for pagination
- Outlook: Switch to delta mode internally on server

=== End Flow Summary ===
  `);
}

