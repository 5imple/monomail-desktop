# Outlook History Sync - Client Implementation

This document describes the client-side implementation of Outlook history sync using watermark-based tracking.

## Key Differences from Gmail

| Aspect             | Gmail                                    | Outlook                                  |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| **Sync Baseline**  | Uses historyId from latest thread        | Uses server-issued historyId (watermark) |
| **Storage**        | IndexedDB (syncHistoryMeta)              | localStorage cache per account           |
| **Cache Key**      | Per account in DB                        | `outlook:history:watermark:<accountId>`  |
| **Error Handling** | Fetch fresh historyId from latest thread | Clear watermark, force full sync         |

## Implementation Overview

### 1. Watermark Cache (`outlookWatermark.ts`)

The watermark cache stores the last historyId returned by the server for each Outlook account:

```typescript
interface OutlookWatermark {
  accountId: string;
  historyId: string;
  lastUpdatedAt: number;
}
```

**Key Functions:**

- `saveOutlookWatermark(accountId, historyId)` - Always update after successful API call
- `getOutlookWatermark(accountId)` - Read cached historyId for sync requests
- `clearOutlookWatermark(accountId)` - Clear on 404 errors (historyId too old)

### 2. History Sync Worker (`historySyncWorker.ts`)

Enhanced to support both Gmail and Outlook providers:

```typescript
// Provider-specific sync functions
async function syncGmailHistory(uid, requestId, abortController);
async function syncOutlookHistory(uid, requestId, abortController);
async function fetchOutlookHistory(uid, historyId, requestId, abortController);
```

### 3. Sync Context (`SyncHistoryContext.tsx`)

Modified to pass account provider information to the worker:

```typescript
const account = getAccountByUid(uid);
const provider = account?.provider || 'google';

workerRef.current.postMessage({
  type: 'SYNC_START',
  payload: { uid, requestId, idToken, provider }
});
```

## Sync Flow

### Initial Sync (No Watermark)

1. **Client**: Read `outlook:history:watermark:<accountId>` → `null`
2. **Client**: Call `/mail/histories` (without historyId parameter)
3. **Server**: Return all items as `messagesAdded` + generate numeric `historyId`
4. **Client**: Process all `messagesAdded` events
5. **Client**: Save `historyId` to localStorage cache

### Incremental Sync (With Watermark)

1. **Client**: Read cached `historyId` from localStorage
2. **Client**: Call `/mail/histories?historyId=<cached_watermark>`
3. **Server**: Return delta changes + updated `historyId`
4. **Client**: Process changes:
   - `messagesDeleted` → Items removed
   - `messagesAdded` → New items in folder
   - `labelsRemoved` → Items moved out of folder
   - `labelsAdded` → Items moved into folder
5. **Client**: Update localStorage with new `historyId`

### Error Handling

#### 404 Error (HistoryId Too Old)

```typescript
if (statusCode === 404) {
  await clearOutlookWatermark(uid);
  // Force full sync next time
}
```

#### Network/Server Errors

- Retry with exponential backoff (up to 3 times)
- Preserve existing watermark for next attempt

## API Behavior (Server-Side)

### Without historyId (Initial Sync)

- Return all items as `messagesAdded`
- Handle `@odata.nextLink` pagination internally
- Switch to delta mode when final page reached
- Generate and return numeric `historyId` (watermark)

### With historyId (Incremental Sync)

- Resume from stored `@odata.deltaLink`
- Emit appropriate change events
- Return updated `nextPageToken` if more pages
- Increment numeric watermark and return as `historyId`

## Testing

### Console Testing

```javascript
// Test watermark functionality
await runOutlookWatermarkTests();

// Test integration flow
await testHistorySyncIntegration();

// Debug watermarks for accounts
await debugOutlookWatermarks(['account1', 'account2']);
```

### Simulation

```javascript
// Simulate complete flow
simulateOutlookHistorySyncFlow();
```

## File Structure

```
src/renderer/app/lib/db/
├── outlookWatermark.ts          # Core watermark cache functions
├── outlookWatermarkUtils.ts     # Testing and debugging utilities
├── __tests__/
│   └── outlookWatermark.test.ts # Test suite
└── OUTLOOK_HISTORY_SYNC.md      # This documentation

src/renderer/app/workers/
└── historySyncWorker.ts         # Enhanced sync worker

src/renderer/app/context/
└── SyncHistoryContext.tsx       # Modified to pass provider info
```

## Critical Implementation Notes

1. **Always Update Watermark**: The watermark MUST be updated after every successful API call, even for pagination.

2. **Handle Null HistoryId**: Initial sync calls should handle `historyId = null` gracefully.

3. **Provider Detection**: Account provider is determined from `MonoAccount.provider` field.

4. **Backward Compatibility**: Gmail accounts continue to use the existing flow without changes.

5. **Error Recovery**: 404 errors clear the watermark and force a fresh sync, not a retry with stale data.

## Usage Example

```typescript
// The sync will automatically detect provider and use appropriate flow
await syncThreadHistory(outlookAccountUid, onComplete, onError, onProgress);
```

The implementation is transparent to the calling code - the provider detection and appropriate sync method selection happens automatically based on the account configuration.

