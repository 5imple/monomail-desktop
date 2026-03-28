import { MonoRecipient } from '@/main/models/types';

export interface ThreadItemBase {
  id: string;
  timestamp: number;
  author: MonoRecipient;
  type: 'message' | 'draft' | 'comment';
}

export interface ThreadItemWithLabels extends ThreadItemBase {
  labelIds: string[];
}

export function isThreadItemWithLabels(item: ThreadItemBase): item is ThreadItemWithLabels {
  return item.type === 'message';
}
