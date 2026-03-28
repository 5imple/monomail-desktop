// Thread operations priority queue with batching
import { useCallback, useRef, useEffect } from 'react';

// Operation priority levels
export enum OperationPriority {
  HIGH = 0, // User-initiated actions (search, click)
  MEDIUM = 1, // UI updates, rendering operations
  LOW = 2 // Background sync, history updates
}

// Operation type for the queue
type QueuedOperation = {
  id: string; // Unique identifier for the operation
  priority: OperationPriority;
  execute: () => Promise<void>;
  type: string; // Type of operation for potential batching
  timestamp: number; // When it was added
  batch?: boolean; // Can this operation be batched?
  batchKey?: string; // Key for batch grouping
};

export const useThreadOperationsQueue = () => {
  // Separate queues for different priority levels
  const operationQueuesRef = useRef<QueuedOperation[][]>([[], [], []]);
  const isProcessingRef = useRef(false);
  const operationCounter = useRef(0);

  // For batching similar operations
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const batchedOperationsRef = useRef<Record<string, QueuedOperation[]>>({});

  // Process the next highest priority operation
  const processNextOperation = useCallback(async () => {
    if (isProcessingRef.current) return;

    // Find the highest priority non-empty queue
    let priorityToProcess = -1;
    for (let i = 0; i < operationQueuesRef.current.length; i++) {
      if (operationQueuesRef.current[i].length > 0) {
        priorityToProcess = i;
        break;
      }
    }

    if (priorityToProcess === -1) return; // No operations to process

    const operation = operationQueuesRef.current[priorityToProcess].shift();
    if (!operation) return;

    isProcessingRef.current = true;

    try {
      await operation.execute();
    } catch (error) {
      console.error(`Error executing operation (${operation.type}):`, error);
    } finally {
      isProcessingRef.current = false;

      // Process next operation immediately
      if (operationQueuesRef.current.some((queue) => queue.length > 0)) {
        processNextOperation();
      }
    }
  }, []);

  // Process all batched operations
  const processBatchedOperations = useCallback(() => {
    const batchKeys = Object.keys(batchedOperationsRef.current);

    batchKeys.forEach((key) => {
      const operations = batchedOperationsRef.current[key];
      if (!operations || operations.length === 0) return;

      // Create a batched operation that combines all operations of the same type
      const batchedOp: QueuedOperation = {
        id: `batch-${key}-${Date.now()}`,
        priority: operations[0].priority, // Use the priority of the first operation
        type: `batched-${operations[0].type}`,
        timestamp: Date.now(),
        execute: async () => {
          // For thread updates, we can combine the data
          if (key.startsWith('update-threads')) {
            // Collect all thread data from the batched operations
            const allThreadsData: Record<string, any[]> = {};

            for (const op of operations) {
              // Extract the data - this would need to adapt to your actual operation structure
              const opData = (op as any).data || {};

              // Group by account ID
              Object.entries(opData).forEach(([accountId, threads]) => {
                if (!allThreadsData[accountId]) allThreadsData[accountId] = [];
                allThreadsData[accountId].push(...(threads as any[]));
              });
            }

            // Execute a single update with the combined data
            // This would need to be adapted to your setThreads function
            for (const [accountId, threads] of Object.entries(allThreadsData)) {
              // Update threads with all batched data
              // await setThreads(accountId, threads, false, false);
              console.log(`Batched update for account ${accountId}: ${threads.length} threads`);
            }
          } else {
            // For other operations that can't be combined easily, execute them in sequence
            for (const op of operations) {
              await op.execute();
            }
          }
        }
      };

      // Add the batched operation to the appropriate queue
      operationQueuesRef.current[batchedOp.priority].push(batchedOp);

      // Clear the batch
      delete batchedOperationsRef.current[key];
    });

    batchTimerRef.current = null;

    // Start processing if needed
    if (!isProcessingRef.current) {
      processNextOperation();
    }
  }, [processNextOperation]);

  // Add a new operation to the queue
  const enqueueOperation = useCallback(
    (
      execute: () => Promise<void>,
      options: {
        priority?: OperationPriority;
        type: string;
        batch?: boolean;
        batchKey?: string;
        batchDelay?: number;
        data?: any;
      }
    ) => {
      const {
        priority = OperationPriority.MEDIUM,
        type,
        batch = false,
        batchKey,
        batchDelay = 100,
        data
      } = options;

      const operationId = `op-${operationCounter.current++}`;

      const operation: QueuedOperation = {
        id: operationId,
        priority,
        type,
        execute,
        timestamp: Date.now(),
        batch,
        batchKey: batchKey || type
      };

      // Add data for batching if needed
      if (batch && data) {
        (operation as any).data = data;
      }

      // If this operation can be batched
      if (batch) {
        const batchKey = operation.batchKey;
        if (batchKey) {
          // Add to batch collection
          if (!batchedOperationsRef.current[batchKey]) {
            batchedOperationsRef.current[batchKey] = [];
          }
          batchedOperationsRef.current[batchKey].push(operation);
        }

        // Set/reset batch timer
        if (batchTimerRef.current) {
          clearTimeout(batchTimerRef.current);
        }

        batchTimerRef.current = setTimeout(processBatchedOperations, batchDelay);

        return operationId;
      }

      // If not batched, add directly to queue
      operationQueuesRef.current[priority].push(operation);

      // Start processing if not already
      if (!isProcessingRef.current) {
        processNextOperation();
      }

      return operationId;
    },
    [processNextOperation, processBatchedOperations]
  );

  // Cancel an operation if it hasn't started yet
  const cancelOperation = useCallback((operationId: string) => {
    // Check all priority queues
    operationQueuesRef.current.forEach((queue, index) => {
      const opIndex = queue.findIndex((op) => op.id === operationId);
      if (opIndex !== -1) {
        operationQueuesRef.current[index].splice(opIndex, 1);
      }
    });

    // Check batched operations
    Object.keys(batchedOperationsRef.current).forEach((key) => {
      const opIndex = batchedOperationsRef.current[key].findIndex((op) => op.id === operationId);
      if (opIndex !== -1) {
        batchedOperationsRef.current[key].splice(opIndex, 1);

        // Remove empty batch
        if (batchedOperationsRef.current[key].length === 0) {
          delete batchedOperationsRef.current[key];
        }
      }
    });
  }, []);

  // Make sure to clear timeout on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  return {
    enqueueOperation,
    cancelOperation,
    OperationPriority
  };
};

// Example usage:
/*
const { enqueueOperation, OperationPriority } = useThreadOperationsQueue();

// High priority, non-batched operation (user clicked something)
const handleUserAction = () => {
  enqueueOperation(
    async () => {
      // User-initiated action like loading a thread
      await loadThread(threadId);
    },
    { 
      priority: OperationPriority.HIGH,
      type: 'load-thread',
      batch: false
    }
  );
};

// Low priority, batchable operation (history sync)
const handleHistoryUpdate = (updates) => {
  enqueueOperation(
    async () => {
      // Process history updates
    },
    {
      priority: OperationPriority.LOW,
      type: 'history-update',
      batch: true, 
      batchKey: `update-threads-${accountId}`,
      batchDelay: 200,
      data: { [accountId]: updates }
    }
  );
};
*/
