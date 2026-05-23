import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/InboxIcon';
import { Badge } from '@/renderer/app/components/ui/badge';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { cn } from '@/renderer/app/lib/utils';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { FilterCriteria, FilterType } from '@/renderer/app/types';
import React, { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface FilterOptionProps {
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

const FilterOption: FC<FilterOptionProps> = ({
  type,
  icon,
  translationKey,
  filterType,
  subOptions
}) => {
  const { t } = useTranslation();
  const { activeFilters, setActiveFilters } = useThreadFilter();

  // Check if this filter category has any active filters
  const isFilterCategoryActive = useMemo(() => {
    return activeFilters.some((filter) => filter.type === filterType);
  }, [activeFilters, filterType]);

  // Get active filters for this category
  const activeSubFilters = useMemo(() => {
    return activeFilters.filter((filter) => filter.type === filterType);
  }, [activeFilters, filterType]);

  // Toggle a specific filter
  const toggleFilter = (filter: FilterCriteria) => {
    // Check if filter already exists
    const existingFilterIndex = activeFilters.findIndex(
      (f) => f.type === filter.type && f.operator === filter.operator && f.value === filter.value
    );

    if (existingFilterIndex >= 0) {
      // Remove filter if it exists
      const newFilters = [...activeFilters];
      newFilters.splice(existingFilterIndex, 1);
      setActiveFilters(newFilters);
    } else {
      // Add filter if it doesn't exist
      setActiveFilters([...activeFilters, filter]);
    }
  };

  // Check if a specific filter is active
  const isFilterActive = (filterToCheck: FilterCriteria) => {
    return activeFilters.some(
      (filter) =>
        filter.type === filterToCheck.type &&
        filter.operator === filterToCheck.operator &&
        filter.value === filterToCheck.value
    );
  };

  // Clear all filters in this category
  const clearCategoryFilters = () => {
    setActiveFilters(activeFilters.filter((filter) => filter.type !== filterType));
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={cn(isFilterCategoryActive && '')}>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center">
            <MonoIcon type={icon} className="mr-2 h-3.5 w-3.5" />
            <span>{t(translationKey)}</span>
          </div>

          {isFilterCategoryActive && (
            <Badge variant="default" className="ml-2 h-4 px-1 text-xs">
              {activeSubFilters.length}
            </Badge>
          )}
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="dark -mt-1 max-h-96 min-w-36 overflow-y-auto">
        {subOptions.map((subOption, index) => {
          if (subOption.inputField) {
            return (
              <div key={`input-${index}`}>
                <DropdownMenuItem className="flex items-center">
                  <input
                    type="text"
                    placeholder={t(subOption.translationKey)}
                    className="w-full border-none bg-transparent focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        e.preventDefault();
                        const target = e.target as HTMLInputElement;
                        if (target.value) {
                          toggleFilter({
                            type: filterType,
                            operator: subOption.operator,
                            value: target.value
                          });
                          target.value = '';
                        }
                      }
                    }}
                  />
                </DropdownMenuItem>

                {/* Show active filters for input-based filters */}
                {activeSubFilters
                  .filter((filter) => filter.operator === subOption.operator)
                  .map((filter, idx) => (
                    <DropdownMenuItem
                      key={`${filter.type}-${filter.value}-${idx}`}
                      className=""
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleFilter(filter);
                      }}
                    >
                      <span className="mr-2 truncate">{filter.value}</span>
                      <MonoIcon type="X" className="ml-auto h-3 w-3" />
                    </DropdownMenuItem>
                  ))}
              </div>
            );
          }

          // For non-input sub-options
          const filterToCheck: FilterCriteria = {
            type: filterType,
            operator: subOption.operator,
            value: subOption.value
          };

          const isActive = isFilterActive(filterToCheck);

          return (
            <DropdownMenuItem
              key={`${subOption.operator}-${subOption.value || index}`}
              className={cn('', isActive && '')}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleFilter(filterToCheck);
              }}
            >
              <MonoIcon type={subOption.icon || icon} className="mr-2" />
              <span className="mr-2">{t(subOption.translationKey)}</span>
              {isActive && <MonoIcon type="Check" className="ml-auto" />}
            </DropdownMenuItem>
          );
        })}

        {/* Clear category filters button */}
        {isFilterCategoryActive && activeSubFilters.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem className="text-muted-foreground" onClick={clearCategoryFilters}>
              {t('filter.clear_category')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};

export default FilterOption;
