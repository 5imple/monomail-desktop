import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { cn } from '@/renderer/app/lib/utils';
import React, { useEffect, useRef } from 'react';

interface Operator {
  operator: string;
  description: string;
}

interface RecommendationListProps {
  operators: Operator[];
  searchQuery: string;
  onOperatorSelect: (operator: string) => void;
  selectedIndex: number;
}

const RecommendationList: React.FC<RecommendationListProps> = ({
  operators,
  // searchQuery,
  onOperatorSelect,
  selectedIndex
}) => {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: 'instant',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  // const countQueries = (query: string) => {
  //   return query
  //     .trim()
  //     .split(' ')
  //     .filter((part) => part.length > 0).length;
  // };

  return (
    <ScrollArea className="max-h-[320px]">
      <div>
        {/* {countQueries(searchQuery) > 0 && (
          <div className="mb-3">
            <div className="flex items-center py-3">
              <MonoIcon type={'Search'} className="w-4 h-4 mr-2" />
              <span className="mr-2">{`Query search: ${searchQuery}`}</span>
              <ShortcutKeyboard className="ml-auto basis-8" shortcut={'Enter'} />
            </div>
          </div>
        )} */}
        <div className="flex flex-col text-sm">
          {operators.map((operator, index) => (
            <div
              key={operator.operator}
              ref={(el) => (itemRefs.current[index] = el)}
              className={cn(
                `flex items-center cursor-pointer border-l-4 border-transparent p-4 text-sm`,
                selectedIndex === index && 'bg-primary/20 border-primary'
              )}
              onClick={() => {
                onOperatorSelect(operator.operator);
              }}
            >
              <span className="whitespace-nowrap basis-28">
                <span className="operator-label bg-primary/20 py-1 px-2 mr-2 rounded-md">
                  {operator.operator}
                </span>
              </span>
              <span className="flex-1 whitespace-normal line-clamp-1 mr-2">
                {operator.description}
              </span>
              <ShortcutKeyboard className="basis-8" shortcut="Enter" />
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};

export default RecommendationList;
