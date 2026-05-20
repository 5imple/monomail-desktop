import React, { useState, useMemo } from 'react';
import { cn } from '@/renderer/app/lib/utils';
import { formatInTimeZone } from 'date-fns-tz';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/renderer/app/components/ui/command';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import {
  TIMEZONE_OPTIONS,
  POPULAR_TIMEZONES,
  getTimezonesByRegion,
  getTimezoneAbbreviation,
  getCurrentTimeWithAbbreviation,
  getCurrentGMTOffset,
  searchTimezones,
  type TimezoneOption
} from './timezoneUtils';

interface TimezoneSelectorProps {
  selectedTimeZone: string;
  setSelectedTimeZone: (timezone: string) => void;
  userTimeZone: string;
  className?: string;
  style?: React.CSSProperties;
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  selectedTimeZone,
  setSelectedTimeZone,
  userTimeZone,
  className,
  style
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { time: currentTime, abbreviation } = getCurrentTimeWithAbbreviation(selectedTimeZone);
  const timezonesByRegion = getTimezonesByRegion();

  const filteredTimezones = useMemo(() => {
    if (!searchQuery.trim()) {
      return timezonesByRegion;
    }

    const results = searchTimezones(searchQuery);
    const grouped = results.reduce(
      (acc, timezone) => {
        if (!acc[timezone.region]) {
          acc[timezone.region] = [];
        }
        acc[timezone.region].push(timezone);
        return acc;
      },
      {} as Record<string, TimezoneOption[]>
    );

    return grouped;
  }, [searchQuery, timezonesByRegion]);

  const handleTimezoneSelect = (timezoneId: string) => {
    setSelectedTimeZone(timezoneId);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* <PopoverTrigger asChild> */}
      <div
        className={cn(
          'flex flex-col items-center justify-center border-r p-1 text-xs font-medium transition-colors hover:bg-card/80',
          className
        )}
        style={style}
      >
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">{abbreviation}</span>
        </div>
      </div>
      {/* </PopoverTrigger> */}
      <PopoverContent className="w-96 p-0" align="start">
        <Command className="dark rounded-xl">
          <CommandInput
            placeholder="Search timezones..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="m-2 flex h-fit w-full p-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          <CommandList className="dark">
            <ScrollArea className="max-h-80">
              <CommandEmpty>No timezone found.</CommandEmpty>

              {!searchQuery && (
                <>
                  <CommandGroup>
                    {POPULAR_TIMEZONES.map((timezone) => (
                      <CommandItem
                        key={`popular-${timezone.id}`}
                        value={timezone.id}
                        onSelect={() => handleTimezoneSelect(timezone.id)}
                        className="flex items-center py-2"
                      >
                        <div className="flex items-center gap-4">
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {getCurrentGMTOffset(timezone.id)}
                          </span>
                          <span className="text-sm">
                            {timezone.name} – {timezone.city}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {Object.entries(filteredTimezones).map(([region, timezones]) => (
                <CommandGroup key={region} heading={region}>
                  {timezones.map((timezone) => (
                    <CommandItem
                      key={timezone.id}
                      value={timezone.id}
                      onSelect={() => handleTimezoneSelect(timezone.id)}
                      className={cn(
                        'flex items-center py-2',
                        selectedTimeZone === timezone.id && 'bg-accent/10 text-accent'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {getCurrentGMTOffset(timezone.id)}
                        </span>
                        <span className="text-sm">
                          {timezone.name} – {timezone.city}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {/* Show user's system timezone if not in the main list or filtered results */}
              {!TIMEZONE_OPTIONS.find((tz) => tz.id === userTimeZone) &&
                !Object.values(filteredTimezones)
                  .flat()
                  .find((tz) => tz.id === userTimeZone) && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value={`system-${userTimeZone}`}
                        onSelect={() => handleTimezoneSelect(userTimeZone)}
                        className={cn(
                          'flex items-center py-2',
                          selectedTimeZone === userTimeZone && 'bg-accent/10 text-accent'
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {getCurrentGMTOffset(userTimeZone)}
                          </span>
                          <span className="text-sm">{userTimeZone} – System</span>
                        </div>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
            </ScrollArea>
          </CommandList>
        </Command>
        <div className="border-t p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Current time in {getTimezoneAbbreviation(selectedTimeZone)}</span>
            <span className="font-medium">
              {formatInTimeZone(new Date(), selectedTimeZone, 'h:mm a')} ({selectedTimeZone})
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
