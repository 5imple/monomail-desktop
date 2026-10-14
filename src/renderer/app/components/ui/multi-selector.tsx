import { Command as CommandPrimitive, useCommandState } from 'cmdk';
import * as React from 'react';
import { forwardRef, useEffect } from 'react';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import { cn } from '@/renderer/app/lib/utils';

export interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disable?: boolean;
  /** fixed option that can't be removed. */
  fixed?: boolean;
  /** Group the options by providing key. */
  [key: string]: string | boolean | React.ReactNode | undefined;
}
interface GroupOption {
  [key: string]: Option[];
}

export interface MultipleSelectorProps {
  value?: Option[];
  activeValue?: Option[];
  defaultValue?: Option[];
  defaultOptions?: Option[];
  /** manually controlled options */
  options?: Option[];
  placeholder?: string;
  /** Loading component. */
  loadingIndicator?: React.ReactNode;
  /** Empty component. */
  emptyIndicator?: React.ReactNode;
  /** Debounce time for async search. Only work with `onSearch`. */
  delay?: number;
  /**
   * Only work with `onSearch` prop. Trigger search when `onFocus`.
   * For example, when user click on the input, it will trigger the search to get initial options.
   **/
  triggerSearchOnFocus?: boolean;
  /** async search */
  onSearch?: (value: string) => Promise<Option[]>;
  /**
   * sync search. This search will not showing loadingIndicator.
   * The rest props are the same as async search.
   * i.e.: creatable, groupBy, delay.
   **/
  onSearchSync?: (value: string) => Option[];
  onChange?: (options: Option[]) => void;
  /** Limit the maximum number of selected options. */
  maxSelected?: number;

  /** Function to validate creatable options. */
  validateCreatable?: (value: string) => boolean;
  /** Custom validation message for creatable options. */
  validationMessage?: string;

  /** When the number of selected options exceeds the limit, the onMaxSelected will be called. */
  onMaxSelected?: (maxLimit: number) => void;
  onBadgeClick?: (option: Option) => void;
  /** Hide the placeholder when there are options selected. */
  hidePlaceholderWhenSelected?: boolean;
  disabled?: boolean;
  /** Group the options base on provided key. */
  groupBy?: string;
  className?: string;
  /**
   * First item selected is a default behavior by cmdk. That is why the default is true.
   * This is a workaround solution by add a dummy item.
   *
   * @reference: https://github.com/pacocoursey/cmdk/issues/171
   */
  selectFirstItem?: boolean;
  /** Allow user to create option when there is no option matched. */
  creatable?: boolean;
  /** Props of `Command` */
  commandProps?: React.ComponentPropsWithoutRef<typeof Command>;
  /** Props of `CommandInput` */
  inputProps?: Omit<
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>,
    'value' | 'placeholder' | 'disabled'
  >;
  /** hide the clear all button. */
  hideClearAllButton?: boolean;

  hideOnEmpty?: boolean;
  minLetters?: number;
  CustomBadge?: (
    option: Option,
    handleUnSelect: (option: Option) => void,
    activeValue?: Option[],
    disabled?: boolean
  ) => React.ReactNode;
}

// Marks the typed-text ("create") item for the filter, which ranks it.
const CREATABLE_KEYWORD = '__creatable__';

export interface MultipleSelectorRef {
  selectedValue: Option[];
  input: HTMLInputElement;
  focus: () => void;
  reset: () => void;
}

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 500);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

function transToGroupOption(options: Option[], groupBy?: string) {
  if (options.length === 0) {
    return {};
  }
  if (!groupBy) {
    return {
      '': options
    };
  }

  const groupOption: GroupOption = {};
  options.forEach((option) => {
    const key = (option[groupBy] as string) || '';
    if (!groupOption[key]) {
      groupOption[key] = [];
    }
    groupOption[key].push(option);
  });
  return groupOption;
}

function removePickedOption(groupOption: GroupOption, picked: Option[]) {
  const result: GroupOption = {};

  for (const [key, value] of Object.entries(groupOption)) {
    result[key] = value.filter((val) => !picked.find((p) => p.value === val.value));
  }
  return result;
}

function isOptionsExist(groupOption: GroupOption, targetOption: Option[]) {
  for (const [, value] of Object.entries(groupOption)) {
    if (value.some((option) => targetOption.find((p) => p.value === option.value))) {
      return true;
    }
  }
  return false;
}

/**
 * The `CommandEmpty` of shadcn/ui will cause the cmdk empty not rendering correctly.
 * So we create one and copy the `Empty` implementation from `cmdk`.
 *
 * @reference: https://github.com/hsuanyi-chou/shadcn-ui-expansions/issues/34#issuecomment-1949561607
 **/
const CommandEmpty = forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof CommandPrimitive.Empty>
>(({ className, ...props }, forwardedRef) => {
  const render = useCommandState((state) => state.filtered.count === 0);

  if (!render) return null;

  return (
    <div
      ref={forwardedRef}
      className={cn('py-2 text-center text-sm text-muted-foreground', className)}
      // eslint-disable-next-line react/no-unknown-property -- cmdk's empty-state hook
      cmdk-empty=""
      role="presentation"
      {...props}
    />
  );
});

CommandEmpty.displayName = 'CommandEmpty';

const MultipleSelector = React.forwardRef<MultipleSelectorRef, MultipleSelectorProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      placeholder,
      defaultOptions: arrayDefaultOptions = [],
      options: arrayOptions,
      delay,
      onSearch,
      onSearchSync,
      loadingIndicator,
      emptyIndicator,
      maxSelected = Number.MAX_SAFE_INTEGER,
      onMaxSelected,
      hidePlaceholderWhenSelected,
      disabled,
      groupBy,
      className,
      selectFirstItem = true,
      creatable = false,
      minLetters = 0,
      validateCreatable,
      validationMessage = 'Invalid input',
      activeValue,
      onBadgeClick,
      triggerSearchOnFocus = false,
      commandProps,
      inputProps,
      hideClearAllButton = false,
      hideOnEmpty = false,
      CustomBadge
    }: MultipleSelectorProps,
    ref: React.Ref<MultipleSelectorRef>
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [open, setOpen] = React.useState(false);
    const [onScrollbar, setOnScrollbar] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null); // Added this

    const [selected, setSelected] = React.useState<Option[]>(value || []);
    const [options, setOptions] = React.useState<GroupOption>(
      transToGroupOption(arrayDefaultOptions, groupBy)
    );
    const [inputValue, setInputValue] = React.useState('');
    const debouncedSearchTerm = useDebounce(inputValue, delay || 500);

    const [showValidationError, setShowValidationError] = React.useState(false);

    // The list is mounted while the field has focus but hidden below
    // minLetters and, with hideOnEmpty, while the field is empty.
    const suggestionsVisible =
      open && inputValue.length >= (minLetters || 0) && !(hideOnEmpty && inputValue.length === 0);

    React.useImperativeHandle(
      ref,
      () => ({
        selectedValue: [...selected],
        input: inputRef.current as HTMLInputElement,
        focus: () => inputRef.current?.focus(),
        reset: () => setSelected([])
      }),
      [selected]
    );

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        inputRef.current.blur();
      }
    };

    const handleUnselect = React.useCallback(
      (option: Option) => {
        const newOptions = selected.filter((s) => s.value !== option.value);
        setSelected(newOptions);
        onChange?.(newOptions);
      },
      [onChange, selected]
    );

    // Turn free text ("a@x.com, Bob <b@y.com>") into creatable chips. Used on
    // blur, on "," / ";" and on paste: typed addresses were otherwise left
    // sitting in the input, visibly there but silently not in the draft, and
    // a pasted list failed validation as one value. Returns the text that
    // couldn't be committed so it stays in the input for the user to fix.
    const commitCreatableText = React.useCallback(
      (text: string): string => {
        if (!creatable) return text;
        const tokens = text
          .split(/[,;\n]+/)
          .map((token) => token.trim())
          .filter(Boolean);
        const next = [...selected];
        const rejected: string[] = [];
        for (const token of tokens) {
          const value = (token.match(/<([^>]+)>/)?.[1] ?? token).trim();
          if (validateCreatable && !validateCreatable(value)) {
            rejected.push(token);
          } else if (next.some((s) => s.value === value)) {
            continue;
          } else if (next.length >= maxSelected) {
            onMaxSelected?.(next.length);
            rejected.push(token);
          } else {
            next.push({ value, label: value });
          }
        }
        if (next.length !== selected.length) {
          setSelected(next);
          onChange?.(next);
        }
        return rejected.join(', ');
      },
      [creatable, selected, validateCreatable, maxSelected, onMaxSelected, onChange]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const input = inputRef.current;
        if (input) {
          if ((e.key === ',' || e.key === ';') && creatable && input.value.trim()) {
            e.preventDefault();
            setInputValue(commitCreatableText(input.value));
            return;
          }

          // Prevent selection on Enter if the input is empty or doesn't meet the minLetters requirement
          if (e.key === 'Enter' && input.value.trim().length <= (minLetters || 0)) {
            e.preventDefault();
            return;
          }

          if (e.key === 'Delete' || e.key === 'Backspace') {
            if (input.value === '' && selected.length > 0) {
              const lastSelectOption = selected[selected.length - 1];
              // If last item is fixed, we should not remove it.
              if (!lastSelectOption.fixed) {
                handleUnselect(lastSelectOption);
              }
            }
          }

          // Escape closes the suggestions and stays in the field; with none
          // showing, it leaves the field (blur commits typed text).
          if (e.key === 'Escape') {
            if (suggestionsVisible) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            } else {
              input.blur();
            }
          }
        }
      },
      [handleUnselect, selected, minLetters, creatable, commitCreatableText, suggestionsVisible]
    );

    useEffect(() => {
      if (open) {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchend', handleClickOutside);
      } else {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchend', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchend', handleClickOutside);
      };
    }, [open]);

    useEffect(() => {
      if (value) {
        setSelected(value);
      }
    }, [value]);

    useEffect(() => {
      /** If `onSearch` is provided, do not trigger options updated. */
      if (!arrayOptions || onSearch) {
        return;
      }
      const newOption = transToGroupOption(arrayOptions || [], groupBy);
      if (JSON.stringify(newOption) !== JSON.stringify(options)) {
        setOptions(newOption);
      }
    }, [arrayDefaultOptions, arrayOptions, groupBy, onSearch, options]);

    useEffect(() => {
      /** sync search */

      const doSearchSync = () => {
        const res = onSearchSync?.(debouncedSearchTerm);
        setOptions(transToGroupOption(res || [], groupBy));
      };

      const exec = async () => {
        if (!onSearchSync || !open) return;

        if (triggerSearchOnFocus) {
          doSearchSync();
        }

        if (debouncedSearchTerm) {
          doSearchSync();
        }
      };

      void exec();
    }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus]);

    useEffect(() => {
      /** async search */
      const doSearch = async () => {
        if (debouncedSearchTerm.length >= (minLetters || 0)) {
          // Check if input length satisfies minLetters
          setIsLoading(true);
          const res = await onSearch?.(debouncedSearchTerm);
          setOptions(transToGroupOption(res || [], groupBy));
          setIsLoading(false);
        }
      };

      const exec = async () => {
        if (!onSearch || !open) return;

        if (triggerSearchOnFocus) {
          await doSearch();
        }

        if (debouncedSearchTerm) {
          await doSearch();
        }
      };

      void exec();
    }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus, minLetters]);

    const CreatableItem = () => {
      if (!creatable || inputValue.length < (minLetters || 0)) return undefined;
      if (
        isOptionsExist(options, [{ value: inputValue, label: inputValue }]) ||
        selected.find((s) => s.value === inputValue)
      ) {
        return undefined;
      }

      const isValid = validateCreatable ? validateCreatable(inputValue) : true;

      const Item = (
        <>
          <CommandItem
            value={inputValue}
            keywords={[CREATABLE_KEYWORD]}
            className={cn('cursor-pointer rounded-sm')}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onSelect={(value: string) => {
              if (selected.length >= maxSelected) {
                onMaxSelected?.(selected.length);
                return;
              }

              if (!isValid) {
                setShowValidationError(true);
                return;
              }
              setShowValidationError(false);
              const newOptions = [...selected, { value, label: value }];
              setInputValue('');
              setSelected(newOptions);
              onChange?.(newOptions);
            }}
          >
            {`"${inputValue}"`}
            {showValidationError && !isValid && (
              <span className="ml-2 text-sm text-muted-foreground">{validationMessage}</span>
            )}
          </CommandItem>
        </>
      );

      // For normal creatable
      if (!onSearch && inputValue.length > 0) {
        return Item;
      }

      // For async search creatable. avoid showing creatable item before loading at first.
      if (onSearch && debouncedSearchTerm.length > 0 && !isLoading) {
        return Item;
      }

      return undefined;
    };

    const EmptyItem = React.useCallback(() => {
      if (!emptyIndicator) return undefined;

      // For async search that showing emptyIndicator
      if (onSearch && !creatable && Object.keys(options).length === 0) {
        return (
          <CommandItem value="-" disabled>
            {emptyIndicator}
          </CommandItem>
        );
      }

      return <CommandEmpty>{emptyIndicator}</CommandEmpty>;
    }, [creatable, emptyIndicator, onSearch, options]);

    const selectables = React.useMemo<GroupOption>(
      () => removePickedOption(options, selected),

      [options, selected]
    );

    /** Avoid Creatable Selector freezing or lagging when paste a long string. */
    const commandFilter = React.useCallback(() => {
      const filter =
        commandProps?.filter ??
        (creatable
          ? (value: string, search: string) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : -1
          : undefined);
      // Using default filter in `cmdk`. We don't have to provide it.
      if (!creatable || !filter) return filter;

      // The typed-text item ranks by what it is: a complete valid entry
      // ("jen@x.com") outranks matching options — it means that address, not
      // "jen@x.com.au" — while partial text ("jen") ranks below them, so
      // Enter picks the matching contact instead of failing validation.
      return (value: string, search: string, keywords?: string[]) => {
        if (keywords?.includes(CREATABLE_KEYWORD)) {
          return !validateCreatable || validateCreatable(value) ? 2 : 0.5;
        }
        return filter(value, search, keywords);
      };
    }, [creatable, commandProps?.filter, validateCreatable]);

    const creatableItem = CreatableItem();

    return (
      <Command
        ref={dropdownRef}
        {...commandProps}
        onKeyDown={(e) => {
          handleKeyDown(e);
          commandProps?.onKeyDown?.(e);
        }}
        className={cn(
          'h-auto overflow-visible bg-transparent dark:bg-transparent',
          commandProps?.className
        )}
        shouldFilter={
          commandProps?.shouldFilter !== undefined ? commandProps.shouldFilter : !onSearch
        } // When onSearch is provided, we don't want to filter the options. You can still override it.
        filter={commandFilter()}
      >
        <div
          className={cn(
            // The wrapper never takes focus itself: show the field's focus
            // on its border, like the text inputs.
            'rounded-md border border-input text-sm ring-offset-background transition-colors focus-within:border-ring',
            {
              // 'px-2 py-2': selected.length !== 0,
              'cursor-text': !disabled && selected.length !== 0
            },
            className
          )}
          onClick={() => {
            if (disabled) return;
            inputRef.current?.focus();
          }}
        >
          <div className="relative flex flex-wrap items-center gap-1">
            {selected.map((option) => {
              return CustomBadge ? (
                CustomBadge(option, handleUnselect, activeValue, disabled)
              ) : (
                <Badge
                  key={option.value}
                  variant="outline"
                  className={cn(
                    'data-[disabled]:bg-muted-foreground data-[disabled]:text-muted',
                    'p-1 px-3',
                    option.icon && 'pl-1',
                    activeValue &&
                      activeValue.find((active) => active.value === option.value) &&
                      'border-2 border-primary/80 ring-2 ring-primary/20'
                  )}
                  data-fixed={option.fixed}
                  data-disabled={disabled}
                >
                  {option.icon && <span className="mr-2 h-6 w-6">{option.icon}</span>}
                  <div className="max-w-64 overflow-hidden text-ellipsis">
                    <span className="whitespace-nowrap">{option.label}</span>
                  </div>
                  {!option.fixed && (
                    <button
                      className="ml-1 rounded-full outline-none ring-offset-background"
                      onClick={() => {
                        handleUnselect(option);
                        onBadgeClick?.(option);
                      }}
                    >
                      <MonoIcon
                        type={'X'}
                        className="h-3 w-3 text-muted-foreground hover:text-foreground"
                      />
                    </button>
                  )}
                </Badge>
              );
            })}

            {/* Avoid having the "Search" Icon */}
            <CommandPrimitive.Input
              {...inputProps}
              ref={inputRef}
              value={inputValue}
              disabled={disabled}
              onValueChange={(value) => {
                setInputValue(value);
                // Typing after Escape brings the suggestions back.
                setOpen(true);
                inputProps?.onValueChange?.(value);
              }}
              onBlur={(event) => {
                if (!onScrollbar) {
                  setOpen(false);
                }
                if (creatable && inputValue.trim()) {
                  setInputValue(commitCreatableText(inputValue));
                }
                inputProps?.onBlur?.(event);
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text');
                if (creatable && /[,;\n<]/.test(pasted)) {
                  event.preventDefault();
                  setInputValue(commitCreatableText(`${inputValue}${pasted}`));
                }
              }}
              onFocus={(event) => {
                setOpen(true);
                if (triggerSearchOnFocus) onSearch?.(debouncedSearchTerm);
                inputProps?.onFocus?.(event);
              }}
              placeholder={hidePlaceholderWhenSelected && selected.length !== 0 ? '' : placeholder}
              className={cn(
                'flex-1 rounded-md bg-transparent p-3 outline-none placeholder:text-muted-foreground',

                hidePlaceholderWhenSelected && 'w-full'
                // inputProps?.className
              )}
            />

            <Button
              type="button"
              onClick={() => {
                setSelected(selected.filter((s) => s.fixed));
                onChange?.(selected.filter((s) => s.fixed));
              }}
              variant={'text'}
              sizeVariant={'sm'}
              typeVariant={'icon'}
              className={cn(
                'absolute right-0',
                (hideClearAllButton ||
                  disabled ||
                  selected.length < 1 ||
                  selected.filter((s) => s.fixed).length === selected.length) &&
                  'hidden'
              )}
            >
              <MonoIcon type={'X'} className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          {open && (
            <CommandList
              className={cn(
                // Follows the theme (a forced `dark` made a black slab on the
                // light compose card). No overflow class here: it would
                // replace CommandList's overflow-y-auto and stop the wheel
                // from scrolling a long list.
                'absolute top-1 z-10 w-full rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md outline-none animate-in',

                inputValue.length < (minLetters || 0) ? 'hidden' : '',
                hideOnEmpty && inputValue.length === 0 ? 'hidden' : ''
              )}
              onMouseLeave={() => {
                setOnScrollbar(false);
              }}
              onMouseEnter={() => {
                setOnScrollbar(true);
              }}
              onMouseUp={() => {
                inputRef.current?.focus();
              }}
            >
              {isLoading ? (
                <>{loadingIndicator}</>
              ) : (
                <>
                  {EmptyItem()}
                  {!selectFirstItem && <CommandItem value="-" className="hidden" />}
                  {Object.entries(selectables).map(([key, dropdowns]) => (
                    <CommandGroup key={key} value={`options:${key}`} heading={key}>
                      <>
                        {dropdowns.map((option, index) => {
                          return (
                            <CommandItem
                              key={option.value}
                              value={`${option.label} (${option.value})`}
                              disabled={option.disable}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onSelect={() => {
                                if (selected.length >= maxSelected) {
                                  onMaxSelected?.(selected.length);
                                  return;
                                }
                                setInputValue('');
                                const newOptions = [...selected, option];
                                setSelected(newOptions);
                                onChange?.(newOptions);
                              }}
                              className={cn(
                                'cursor-pointer rounded-sm',
                                option.disable && 'cursor-default text-muted-foreground'
                              )}
                            >
                              {option.icon && (
                                <span className="mr-2 h-6 w-6 shrink-0">{option.icon}</span>
                              )}
                              <span className="truncate">{option.label}</span>
                            </CommandItem>
                          );
                        })}
                      </>
                    </CommandGroup>
                  ))}
                  {/* In a group of its own so cmdk orders it by score among
                      the option groups (ungrouped items always came first). */}
                  {creatableItem && <CommandGroup value="creatable">{creatableItem}</CommandGroup>}
                </>
              )}
            </CommandList>
          )}
        </div>
      </Command>
    );
  }
);

MultipleSelector.displayName = 'MultipleSelector';
export default MultipleSelector;
