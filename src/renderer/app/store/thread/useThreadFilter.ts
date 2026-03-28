/* eslint-disable no-case-declarations */
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { isCalendarAttachment } from '@/renderer/app/lib/icsParser';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { activeFiltersAtom, isThreadFilteredAtom, threadsMapAtom } from './atoms';

export function useThreadFilter() {
  const [activeFilters, setActiveFilters] = useAtom(activeFiltersAtom);
  const [threadsMap] = useAtom(threadsMapAtom);
  const { labelsMapByAccount } = useLabelAtom();

  // Helper function to get all label IDs across accounts that match a name
  const getLabelIdsByName = useCallback(
    (labelName: string): string[] => {
      const result: string[] = [];

      Object.entries(labelsMapByAccount).forEach(([accountId, labelsMap]) => {
        Object.entries(labelsMap).forEach(([labelId, label]) => {
          if (label.name.toLowerCase() === labelName.toLowerCase()) {
            result.push(labelId);
          }
        });
      });

      return result;
    },
    [labelsMapByAccount]
  );

  /**
   * Applies all active filters to determine if a thread should be included
   */
  const applyFilters = useCallback(
    (thread: MonoThread): boolean => {
      // If no filters are active, include all threads
      if (activeFilters.length === 0) {
        return true;
      }

      // Check if we have both read and unread filters active
      const hasReadFilter = activeFilters.some(
        (f) => f.type === 'read_status' && f.value === 'read' && f.operator === 'is'
      );
      const hasUnreadFilter = activeFilters.some(
        (f) => f.type === 'read_status' && f.value === 'unread' && f.operator === 'is'
      );

      // If both read and unread filters are active, we'll consider this filter type as satisfied
      // and focus on other filters only
      let filtersToApply = activeFilters;
      if (hasReadFilter && hasUnreadFilter) {
        // Remove both read and unread filters from consideration
        filtersToApply = activeFilters.filter((f) => f.value !== 'read' && f.value !== 'unread');

        // If no other filters remain, include all threads
        if (filtersToApply.length === 0) {
          return true;
        }
      }

      // Group filters by type for OR logic within the same filter type
      const filtersByType: Record<string, typeof activeFilters> = {};
      filtersToApply.forEach((filter) => {
        if (!filtersByType[filter.type]) {
          filtersByType[filter.type] = [];
        }
        filtersByType[filter.type].push(filter);
      });

      // Apply each filter type - thread must match ALL filter types (AND logic)
      // but for each filter type, the thread only needs to match ONE of the filters (OR logic)
      return Object.values(filtersByType).every((filtersOfType) => {
        // OR logic for filters of the same type
        return filtersOfType.some((filter) => {
          switch (filter.type) {
            case 'read_status':
              if (filter.operator === 'is') {
                if (filter.value === 'read') {
                  return !thread.labelIds.includes('UNREAD');
                } else {
                  return thread.labelIds.includes('UNREAD');
                }
              }
              break;

            case 'attachment':
              if (filter.operator === 'has') {
                return Object.keys(thread.attachments).length > 0;
              } else if (filter.operator === 'does_not_have') {
                return Object.keys(thread.attachments).length === 0;
              }
              break;

            case 'calendar':
              const hasCalendarEvent = thread.items.some((item) => {
                if (item.type === 'message') {
                  return Object.values((item as MonoMessage).attachments).some((attachment) =>
                    isCalendarAttachment(attachment)
                  );
                }
                return false;
              });

              if (filter.operator === 'has') {
                return hasCalendarEvent;
              } else if (filter.operator === 'does_not_have') {
                return !hasCalendarEvent;
              }
              break;

            case 'label':
              if (filter.operator === 'contains' && filter.value) {
                // Get all label IDs that match this label name across all accounts
                const matchingLabelIds = getLabelIdsByName(filter.value);

                // Check if thread has any of these label IDs
                return (
                  matchingLabelIds.length > 0 &&
                  thread.labelIds.some((labelId) => matchingLabelIds.includes(labelId))
                );
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                // Get all label IDs that match this label name across all accounts
                const matchingLabelIds = getLabelIdsByName(filter.value);

                // Check that thread doesn't have any of these label IDs
                return (
                  matchingLabelIds.length === 0 ||
                  !thread.labelIds.some((labelId) => matchingLabelIds.includes(labelId))
                );
              }
              break;

            case 'from':
              if (filter.operator === 'contains' && filter.value) {
                return thread.from.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                return !thread.from.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              }
              break;

            case 'to':
              if (filter.operator === 'contains' && filter.value) {
                return thread.to.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                return !thread.to.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              }
              break;

            case 'cc':
              if (filter.operator === 'contains' && filter.value) {
                return thread.cc.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                return !thread.cc.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              }
              break;

            case 'bcc':
              if (filter.operator === 'contains' && filter.value) {
                return thread.bcc.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                return !thread.bcc.some(
                  (recipient) =>
                    recipient.email.toLowerCase().includes(filter.value!.toLowerCase()) ||
                    (recipient.name &&
                      recipient.name.toLowerCase().includes(filter.value!.toLowerCase()))
                );
              }
              break;

            case 'subject':
              if (filter.operator === 'contains' && filter.value) {
                return thread.subject.toLowerCase().includes(filter.value.toLowerCase());
              } else if (filter.operator === 'does_not_contain' && filter.value) {
                return !thread.subject.toLowerCase().includes(filter.value.toLowerCase());
              }
              break;

            case 'date':
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);

              const thisWeekStart = new Date(today);
              thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());

              const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

              const threadDate = new Date(thread.timestamp);

              if (filter.operator === 'is') {
                switch (filter.value) {
                  case 'today':
                    return threadDate >= today;

                  case 'yesterday':
                    return threadDate >= yesterday && threadDate < today;

                  case 'this_week':
                    return threadDate >= thisWeekStart;

                  case 'this_month':
                    return threadDate >= thisMonthStart;

                  default:
                    return true;
                }
              }
              break;
          }

          // If the filter logic isn't handled, default to including the thread
          return true;
        });
      });
    },
    [activeFilters, getLabelIdsByName]
  );

  /**
   * Filter thread IDs based on active filters
   */
  const filterThreadIds = useCallback(
    (threadIds: string[]): string[] => {
      if (activeFilters.length === 0) {
        return threadIds;
      }
      return threadIds.filter((id) => {
        const thread = threadsMap[id];
        if (!thread) return false;
        return applyFilters(thread);
      });
    },
    [activeFilters, threadsMap]
  );

  /**
   * Memoized value to track if any filters are active
   */
  const hasActiveFilters = useMemo(() => activeFilters.length > 0, [activeFilters]);

  return {
    applyFilters,
    filterThreadIds,
    hasActiveFilters,
    activeFilters,
    setActiveFilters
  };
}
