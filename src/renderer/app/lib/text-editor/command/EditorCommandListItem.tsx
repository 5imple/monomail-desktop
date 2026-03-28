import { IMonoTemplate } from '@/main/api/template/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { cn } from '@/renderer/app/lib/utils';
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface EditorCommandListItemProps {
  items: Array<{
    title: string;
    template?: IMonoTemplate;
    icon?: string;
    description?: string;
    category?: string;
    command?: (props: any) => void;
    element?: React.ReactNode;
  }>;
  command: (item: any) => void;
  label?: string;
}

// Use forwardRef to pass refs from parent components
const EditorCommandListItem = forwardRef<any, EditorCommandListItemProps>((props, ref) => {
  const { items, command, label } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { trackEvent } = useUserTrackingData(); // Now using hook properly in function component
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll to selected item when selection changes
  useEffect(() => {
    scrollToSelected();
  }, [selectedIndex]);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      // If no items, treat Enter like Escape (hide command)
      if (items.length === 0 && event.key === 'Enter') {
        return true; // This will be handled as "exit" in the parent component
      }

      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    }
  }));

  const upHandler = () => {
    setSelectedIndex((prevIndex) => (prevIndex + items.length - 1) % items.length);
  };

  const downHandler = () => {
    setSelectedIndex((prevIndex) => (prevIndex + 1) % items.length);
  };

  const scrollToSelected = () => {
    // Only scroll if we have items
    if (items.length === 0) return;

    // Find the currently selected element
    const selectedElement = document.querySelector(`[data-command-index="${selectedIndex}"]`);
    if (selectedElement && scrollContainerRef.current) {
      // Scroll the selected item into view
      selectedElement.scrollIntoView({
        block: 'nearest'
      });
    }
  };

  const enterHandler = () => {
    // Only select if we have items
    if (items.length > 0) {
      selectItem(selectedIndex);
    }
  };

  const selectItem = (index: number) => {
    const item = items[index];

    if (item && trackEvent) {
      trackEvent('compose_slash_command_used', {
        category: item.category || 'Other',
        command: item.title,
        is_template: !!item.template
      });
    }

    if (item) {
      command(item);
    }
  };

  // Group items by category
  const groupedItems = items.reduce((acc: Record<string, any[]>, item) => {
    // Default category if not specified
    const category = item.category || 'Other';

    if (!acc[category]) {
      acc[category] = [];
    }

    acc[category].push(item);
    return acc;
  }, {});

  return (
    <div className="p-1">
      {items.length > 0 ? (
        <div
          ref={scrollContainerRef}
          className="commands-scroll-container max-h-80 overflow-y-auto"
        >
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="mb-2">
              <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">{category}</div>
              <div>
                {categoryItems.map((item, itemIndex) => {
                  const index = items.findIndex(
                    (i) =>
                      i.title === item.title &&
                      (i.category || 'Other') === (item.category || 'Other')
                  );
                  const isSelected = index === selectedIndex;

                  return (
                    <div
                      key={`${category}-${item.title}-${itemIndex}`}
                      data-command-index={index}
                      className={cn(
                        'cursor-pointer rounded-md px-2 py-1.5',
                        isSelected
                          ? 'bg-muted dark:bg-muted-high'
                          : 'hover:bg-muted/50 dark:hover:bg-muted-high'
                      )}
                      onClick={() => selectItem(index)}
                    >
                      {item.element || (
                        <div className="flex items-center gap-2">
                          <div>
                            {item.category === 'Text Color' ? (
                              <div
                                className="h-4 w-4 rounded-sm border border-border/50"
                                style={{
                                  backgroundColor:
                                    item.title.toLowerCase() === 'white'
                                      ? '#ffffff'
                                      : item.title.toLowerCase() === 'black'
                                        ? '#000000'
                                        : item.title.toLowerCase() === 'dark gray'
                                          ? '#424242'
                                          : item.title.toLowerCase() === 'gray'
                                            ? '#757575'
                                            : item.title.toLowerCase() === 'light gray'
                                              ? '#BDBDBD'
                                              : item.title.toLowerCase() === 'red'
                                                ? '#EA4335'
                                                : item.title.toLowerCase() === 'yellow'
                                                  ? '#FBBC05'
                                                  : item.title.toLowerCase() === 'green'
                                                    ? '#34A853'
                                                    : item.title.toLowerCase() === 'blue'
                                                      ? '#4285F4'
                                                      : item.title.toLowerCase() === 'purple'
                                                        ? '#AA00FF'
                                                        : ''
                                }}
                              />
                            ) : item.category === 'Highlight Color' ? (
                              <div
                                className="h-4 w-4 rounded-sm border border-border/50"
                                style={{
                                  backgroundColor: item.title.toLowerCase().includes('yellow')
                                    ? '#FEEFC3'
                                    : item.title.toLowerCase().includes('red')
                                      ? '#FCE8E6'
                                      : item.title.toLowerCase().includes('green')
                                        ? '#E6F4EA'
                                        : item.title.toLowerCase().includes('blue')
                                          ? '#E8F0FE'
                                          : item.title.toLowerCase().includes('purple')
                                            ? '#F3E8FD'
                                            : item.title.toLowerCase().includes('orange')
                                              ? '#FEF7E0'
                                              : ''
                                }}
                              />
                            ) : (
                              <MonoIcon type={item.icon} className="text-primary/80" />
                            )}
                          </div>
                          <div className="flex flex-row items-center gap-2 overflow-hidden text-ellipsis text-start">
                            <div className="w-36 overflow-hidden text-ellipsis text-sm">
                              <span className="whitespace-nowrap">{item.title}</span>
                            </div>
                            {item.description && (
                              <div className="w-full overflow-hidden text-ellipsis text-muted-foreground">
                                <span className="whitespace-nowrap text-sm">
                                  {item.description}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center text-muted-foreground">
          <span className="text-sm">No results found</span>
        </div>
      )}
    </div>
  );
});
EditorCommandListItem.displayName = 'EditorCommandListItem';
export default EditorCommandListItem;
