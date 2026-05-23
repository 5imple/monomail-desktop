import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Badge } from '@/renderer/app/components/ui/badge';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { FilterCriteria } from '@/renderer/app/types';
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const LabelFilterOption: FC = () => {
  const { t } = useTranslation();
  const { activeFilters, setActiveFilters } = useThreadFilter();
  const { getUniqueCustomLabelNames, getAllLabels } = useLabelAtom();

  // Get all unique custom label names (excluding default Gmail labels)
  const uniqueLabelNames = useMemo(() => {
    return getUniqueCustomLabelNames();
  }, [getUniqueCustomLabelNames]);

  // Create a map of label names to their colors (using the first color found for each name)
  const labelColorsMap = useMemo(() => {
    const allLabels = getAllLabels();
    const colorMap = new Map<string, { textColor?: string; backgroundColor?: string }>();

    allLabels.forEach((label) => {
      // If we don't have this label name yet, or current label has color but stored one doesn't
      if (
        !colorMap.has(label.name) ||
        (Object.keys(label.color || {}).length > 0 &&
          Object.keys(colorMap.get(label.name) || {}).length === 0)
      ) {
        colorMap.set(label.name, label.color || {});
      }
    });

    return colorMap;
  }, [getAllLabels]);

  // Check if any label filters are active
  const isFilterCategoryActive = useMemo(() => {
    return activeFilters.some((filter) => filter.type === 'label');
  }, [activeFilters]);

  // Get active label filter names
  const activeLabelNames = useMemo(() => {
    return activeFilters
      .filter((filter) => filter.type === 'label' && filter.operator === 'contains')
      .map((filter) => filter.value as string);
  }, [activeFilters]);

  // Toggle a specific label filter
  const toggleLabelFilter = (labelName: string) => {
    const filterToToggle: FilterCriteria = {
      type: 'label',
      operator: 'contains',
      value: labelName
    };

    // Check if filter already exists
    const existingFilterIndex = activeFilters.findIndex(
      (filter) =>
        filter.type === 'label' && filter.operator === 'contains' && filter.value === labelName
    );

    if (existingFilterIndex >= 0) {
      // Remove filter if it exists
      const newFilters = [...activeFilters];
      newFilters.splice(existingFilterIndex, 1);
      setActiveFilters(newFilters);
    } else {
      // Add filter if it doesn't exist
      setActiveFilters([...activeFilters, filterToToggle]);
    }
  };

  // Check if a specific label filter is active
  const isLabelFilterActive = (labelName: string) => {
    return activeFilters.some(
      (filter) =>
        filter.type === 'label' && filter.operator === 'contains' && filter.value === labelName
    );
  };

  // Clear all label filters
  const clearLabelFilters = () => {
    setActiveFilters(activeFilters.filter((filter) => filter.type !== 'label'));
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={cn(isFilterCategoryActive && '')}>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center">
            <MonoIcon type="Label" className="mr-2 h-3.5 w-3.5" />
            <span>{t('filter.label')}</span>
          </div>

          {isFilterCategoryActive && (
            <Badge variant="default" className="ml-2 h-4 px-1 text-xs">
              {activeLabelNames.length}
            </Badge>
          )}
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="dark -mt-1 max-h-96 min-w-48 overflow-y-auto transition-all">
        {uniqueLabelNames.length > 0 ? (
          <>
            {uniqueLabelNames.map((labelName) => {
              const isActive = isLabelFilterActive(labelName);
              const labelColor = labelColorsMap.get(labelName) || {};

              return (
                <DropdownMenuItem
                  key={labelName}
                  className={cn('', isActive && '')}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleLabelFilter(labelName);
                  }}
                >
                  <MonoIcon
                    type="Label"
                    className="mr-2"
                    style={
                      labelColor && labelColor.backgroundColor
                        ? { color: labelColor.backgroundColor }
                        : {}
                    }
                  />
                  <span className="mr-2 truncate">{labelName.replace('Mono/', '')}</span>
                  {isActive && <MonoIcon type="Check" className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}

            {isFilterCategoryActive && (
              <>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem className="text-muted-foreground" onClick={clearLabelFilters}>
                  {t('filter.clear_category')}
                </DropdownMenuItem>
              </>
            )}
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};

export default LabelFilterOption;
