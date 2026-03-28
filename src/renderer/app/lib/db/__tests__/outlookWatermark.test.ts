// Test file for Outlook watermark functionality
// Note: This is a basic test structure - in a real environment, you'd use a proper testing framework

import {
  getOutlookWatermark,
  saveOutlookWatermark,
  clearOutlookWatermark,
  OutlookWatermark
} from '../outlookWatermark';

/**
 * Simple test runner for Outlook watermark functionality
 * Run this in the browser console to test the implementation
 */
export async function runOutlookWatermarkTests(): Promise<void> {
  console.log('Starting Outlook watermark tests...');

  const testAccountId = 'test-outlook-account-123';
  let testsPassed = 0;
  let testsTotal = 0;

  // Helper function to run a test
  const runTest = async (testName: string, testFn: () => Promise<boolean>) => {
    testsTotal++;
    try {
      const result = await testFn();
      if (result) {
        console.log(`✅ ${testName}: PASSED`);
        testsPassed++;
      } else {
        console.error(`❌ ${testName}: FAILED`);
      }
    } catch (error) {
      console.error(`❌ ${testName}: ERROR -`, error);
    }
  };

  // Test 1: Initial state (no watermark)
  await runTest('Initial state should return null', async () => {
    await clearOutlookWatermark(testAccountId);
    const watermark = await getOutlookWatermark(testAccountId);
    return watermark === null;
  });

  // Test 2: Save watermark
  await runTest('Should save watermark correctly', async () => {
    const testHistoryId = 'test-history-id-456';
    await saveOutlookWatermark(testAccountId, testHistoryId);
    const watermark = await getOutlookWatermark(testAccountId);

    return (
      watermark !== null &&
      watermark.accountId === testAccountId &&
      watermark.historyId === testHistoryId &&
      typeof watermark.lastUpdatedAt === 'number'
    );
  });

  // Test 3: Update watermark
  await runTest('Should update existing watermark', async () => {
    const firstHistoryId = 'first-history-id-789';
    const secondHistoryId = 'second-history-id-101112';

    await saveOutlookWatermark(testAccountId, firstHistoryId);
    const firstWatermark = await getOutlookWatermark(testAccountId);

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    await saveOutlookWatermark(testAccountId, secondHistoryId);
    const secondWatermark = await getOutlookWatermark(testAccountId);

    return (
      firstWatermark !== null &&
      secondWatermark !== null &&
      secondWatermark.historyId === secondHistoryId &&
      secondWatermark.lastUpdatedAt > firstWatermark.lastUpdatedAt
    );
  });

  // Test 4: Clear watermark
  await runTest('Should clear watermark correctly', async () => {
    await saveOutlookWatermark(testAccountId, 'temp-history-id');
    await clearOutlookWatermark(testAccountId);
    const watermark = await getOutlookWatermark(testAccountId);
    return watermark === null;
  });

  // Test 5: Handle invalid inputs
  await runTest('Should handle invalid inputs gracefully', async () => {
    try {
      // These should not throw errors
      await saveOutlookWatermark('', '');
      await getOutlookWatermark('');
      await clearOutlookWatermark('');
      return true;
    } catch (error) {
      return false;
    }
  });

  // Cleanup
  await clearOutlookWatermark(testAccountId);

  console.log(`\nTest Results: ${testsPassed}/${testsTotal} tests passed`);

  if (testsPassed === testsTotal) {
    console.log('🎉 All Outlook watermark tests passed!');
  } else {
    console.log('⚠️ Some tests failed. Check the implementation.');
  }
}

/**
 * Test the integration with the history sync worker
 * This simulates the actual usage pattern
 */
export async function testHistorySyncIntegration(): Promise<void> {
  console.log('Testing history sync integration...');

  const mockAccountId = 'mock-outlook-account-integration';

  // Simulate initial sync scenario
  console.log('1. Simulating initial sync (no watermark)');
  await clearOutlookWatermark(mockAccountId);
  let watermark = await getOutlookWatermark(mockAccountId);
  console.log('Initial watermark:', watermark);

  // Simulate server response with first historyId
  console.log('2. Simulating server response with initial historyId');
  const initialHistoryId = 'server-issued-watermark-001';
  await saveOutlookWatermark(mockAccountId, initialHistoryId);
  watermark = await getOutlookWatermark(mockAccountId);
  console.log('After initial sync:', watermark);

  // Simulate incremental sync with new historyId
  console.log('3. Simulating incremental sync with updated historyId');
  const incrementalHistoryId = 'server-issued-watermark-002';
  await saveOutlookWatermark(mockAccountId, incrementalHistoryId);
  watermark = await getOutlookWatermark(mockAccountId);
  console.log('After incremental sync:', watermark);

  // Simulate error scenario (404 - historyId too old)
  console.log('4. Simulating 404 error scenario');
  await clearOutlookWatermark(mockAccountId);
  watermark = await getOutlookWatermark(mockAccountId);
  console.log('After clearing watermark (force full sync):', watermark);

  console.log('History sync integration test completed');
}

// Export for console usage
if (typeof window !== 'undefined') {
  (window as any).runOutlookWatermarkTests = runOutlookWatermarkTests;
  (window as any).testHistorySyncIntegration = testHistorySyncIntegration;
}
