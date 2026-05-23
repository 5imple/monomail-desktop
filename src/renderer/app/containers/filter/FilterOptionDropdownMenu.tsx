import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { cn } from '@/renderer/app/lib/utils';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { FilterType } from '@/renderer/app/types';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FilterOption from './FilterOption';
import { Button } from '@/renderer/app/components/ui/button';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';

interface FilterOptionConfig {
  type: string;
  icon: MonoIconType;
  translationKey: string;
  filterType: FilterType;
  subOptions: {
    operator: 'is' | 'contains' | 'does_not_contain' | 'is_not' | 'has' | 'does_not_have';
    value?: string;
    icon?: MonoIconType;
    translationKey: string;
    inputField?: boolean;
  }[];
}

const FilterOptionDropdownMenu = React.memo(() => {
  const { t } = useTranslation();
  const { applyFilters, threadIds } = useThreadAtom();
  const { activeFilters, setActiveFilters } = useThreadFilter();
  const { resetThreadsArray, fetchThreadsHandler } = useThreadList();

  useEffect(() => {
    applyFilters();
  }, [activeFilters, threadIds]);

  // Define all available filter options
  const allFilterOptions: FilterOptionConfig[] = [
    {
      type: 'read_status',
      icon: 'Envelope',
      translationKey: 'filter.read_status',
      filterType: 'read_status', // This will be adjusted for unread/read
      subOptions: [
        { operator: 'is', value: 'unread', translationKey: 'filter.unread', icon: 'EnvelopeOpen' },
        { operator: 'is', value: 'read', translationKey: 'filter.read', icon: 'Envelope' }
      ]
    },
    {
      type: 'attachment',
      icon: 'Paperclip',
      translationKey: 'filter.attachment',
      filterType: 'attachment',
      subOptions: [
        { operator: 'has', translationKey: 'filter.has_attachment', icon: 'Paperclip' },
        { operator: 'does_not_have', translationKey: 'filter.no_attachment' }
      ]
    },
    // {
    //   type: 'from',
    //   icon: 'UserCircle',
    //   translationKey: 'filter.from',
    //   filterType: 'from',
    //   subOptions: [{ operator: 'contains', translationKey: 'filter.enter_email', inputField: true }]
    // },
    {
      type: 'calendar',
      icon: 'Calendar',
      translationKey: 'filter.calendar',
      filterType: 'calendar',
      subOptions: [
        { operator: 'has', translationKey: 'filter.has_calendar', icon: 'Calendar' },
        { operator: 'does_not_have', translationKey: 'filter.no_calendar' }
      ]
    },
    {
      type: 'date',
      icon: 'Calendar',
      translationKey: 'filter.date',
      filterType: 'date',
      subOptions: [
        { operator: 'is', value: 'today', translationKey: 'filter.today', icon: 'Calendar' },
        {
          operator: 'is',
          value: 'yesterday',
          translationKey: 'filter.yesterday',
          icon: 'Calendar'
        },
        {
          operator: 'is',
          value: 'this_week',
          translationKey: 'filter.this_week',
          icon: 'Calendar'
        },
        {
          operator: 'is',
          value: 'this_month',
          translationKey: 'filter.this_month',
          icon: 'Calendar'
        }
      ]
    }
  ];

  // Function to check if a filter category has any active filters
  const isFilterCategoryActive = (filterType: string): boolean => {
    return activeFilters.some((f) => {
      const option = allFilterOptions.find((opt) => opt.type === filterType);
      return f.type === (option?.filterType || '');
    });
  };

  // Get active filter categories
  const activeFilterCategories = useMemo(() => {
    return allFilterOptions.filter((option) => isFilterCategoryActive(option.type));
  }, [activeFilters]);

  // Get inactive filter categories
  const inactiveFilterCategories = useMemo(() => {
    return allFilterOptions.filter((option) => !isFilterCategoryActive(option.type));
  }, [activeFilters]);

  const handleClearAll = () => {
    resetThreadsArray();
    setActiveFilters([]);
    fetchThreadsHandler();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          sizeVariant="sm"
          className={cn(
            'flex items-center text-muted-foreground',
            activeFilters.length > 0 && 'text-accent hover:text-accent'
          )}
        >
          <MonoIcon type="Filter" />
          {activeFilters.length > 0 && (
            <Badge className="ml-1 h-4 bg-accent px-1 text-xs text-accent-foreground hover:bg-accent">
              {activeFilters.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" className="no-drag dark mr-2 min-w-56 origin-top-right data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-150">
          {/* Section for active filters */}
          {activeFilterCategories.length > 0 && (
            <>
              {activeFilterCategories.map((option) => (
                <FilterOption
                  key={option.type}
                  type={option.type}
                  icon={option.icon}
                  translationKey={option.translationKey}
                  filterType={option.filterType}
                  subOptions={option.subOptions}
                />
              ))}

              {inactiveFilterCategories.length > 0 && (
                <DropdownMenuSeparator className="my-1" />
              )}
            </>
          )}

          {/* Section for inactive filters */}
          {inactiveFilterCategories.length > 0 && (
            <>
              {inactiveFilterCategories.map((option) => (
                <FilterOption
                  key={option.type}
                  type={option.type}
                  icon={option.icon}
                  translationKey={option.translationKey}
                  filterType={option.filterType}
                  subOptions={option.subOptions}
                />
              ))}
            </>
          )}

          {/* Clear all filters button */}
          {activeFilters.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem className="text-muted-foreground" onClick={handleClearAll}>
                {t('filter.clear_all')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
});

FilterOptionDropdownMenu.displayName = 'FilterOptionDropdownMenu';

export default FilterOptionDropdownMenu;
