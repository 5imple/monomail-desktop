import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { ellipsisEmailString, ellipsisString } from '@/renderer/app/lib/minimizeEmail';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mailApi from '@/main/api/mail/mailApi';
import { useAuth } from '@/renderer/app/context/AuthContext';
import MonoIcon from '@/renderer/app/components/icons/icons';
import Loader from '@/renderer/app/components/ui/loader';
import { Button } from '@/renderer/app/components/ui/button';

interface SearchCommandPageProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onClose: () => void;
  onSelect: () => void;
  pushPage: (value: string[]) => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onAiSearchStateChange?: (isActive: boolean, isLoading: boolean) => void;
  initialAiSearchMode?: boolean;
}

const SearchCommandPage: React.FC<SearchCommandPageProps> = ({
  searchQuery,
  setSearchQuery,
  onClose,
  onSelect,
  pushPage,
  bounce,
  onKeydown,
  onAiSearchStateChange,
  initialAiSearchMode = false
}) => {
  const [searchState, setSearchState] = useState({
    currentQueryPart: '',
    showOperators: true
  });
  const [aiSearchMode, setAiSearchMode] = useState(initialAiSearchMode);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const { searchNewQuery, searchHistory, removeFromSearchHistory } = useGlobalAtom();
  const { openDialog, closeDialog } = useDialogs();
  const { contactArray } = useContactAtom();
  const { activeSpace } = useSpaceAtom();
  const { accounts } = useAuth();

  const unpinnedContacts = useMemo(() => {
    const pinnedEmails = activeSpace?.pinnedEmails || [];
    return contactArray.filter((contact) => !pinnedEmails.includes(contact.emailAddress));
  }, [activeSpace?.pinnedEmails, contactArray]);

  // Get our tracking hook
  const { t } = useTranslation();
  const { trackEvent } = useUserTrackingData();

  const parentOperators = [
    { operator: 'from:', description: t('command_palette.search.from.description') },
    { operator: 'to:', description: t('command_palette.search.to.description') },
    { operator: 'subject:', description: t('command_palette.search.subject.description') },
    { operator: 'label:', description: t('command_palette.search.label.description') },
    { operator: 'filename:', description: t('command_palette.search.filename.description') },
    { operator: 'in:', description: t('command_palette.search.in.description') },
    { operator: 'is:', description: t('command_palette.search.is.description') },
    { operator: 'cc:', description: t('command_palette.search.cc.description') },
    { operator: 'bcc:', description: t('command_palette.search.bcc.description') },
    { operator: 'after:', description: t('command_palette.search.after.description') },
    { operator: 'before:', description: t('command_palette.search.before.description') },
    { operator: 'older_than:', description: t('command_palette.search.older_than.description') },
    { operator: 'newer_than:', description: t('command_palette.search.newer_than.description') },
    { operator: 'deliveredto:', description: t('command_palette.search.deliveredto.description') },
    { operator: 'category:', description: t('command_palette.search.category.description') },
    { operator: 'size:', description: t('command_palette.search.size.description') },
    { operator: 'larger:', description: t('command_palette.search.larger.description') },
    { operator: 'smaller:', description: t('command_palette.search.smaller.description') }
  ];

  const allOperators = [
    ...parentOperators,
    { operator: 'OR', description: t('command_palette.search.OR.description') },
    { operator: '-', description: t('command_palette.search.-.description') },
    { operator: 'AROUND', description: t('command_palette.search.AROUND.description') },
    {
      operator: 'has:attachment',
      description: t('command_palette.search.has:attachment.description')
    },
    { operator: 'has:drive', description: t('command_palette.search.has:drive.description') },
    {
      operator: 'has:document',
      description: t('command_palette.search.has:document.description')
    },
    {
      operator: 'has:spreadsheet',
      description: t('command_palette.search.has:spreadsheet.description')
    },
    {
      operator: 'has:presentation',
      description: t('command_palette.search.has:presentation.description')
    },
    { operator: 'has:youtube', description: t('command_palette.search.has:youtube.description') },
    { operator: 'list:', description: t('command_palette.search.list.description') },
    { operator: 'in:anywhere', description: t('command_palette.search.in:anywhere.description') },
    {
      operator: 'category:primary',
      description: t('command_palette.search.category.primary.description')
    },
    { operator: 'in:inbox', description: t('command_palette.search.in:inbox.description') },
    { operator: 'is:starred', description: t('command_palette.search.is:starred.description') },
    { operator: 'is:snoozed', description: t('command_palette.search.is:snoozed.description') },
    { operator: 'is:unread', description: t('command_palette.search.is:unread.description') },
    { operator: 'is:read', description: t('command_palette.search.is:read.description') },
    { operator: '""', description: t('command_palette.search.exact.description') },
    { operator: '+', description: t('command_palette.search.+.description') },
    { operator: 'rfc822msgid:', description: t('command_palette.search.rfc822msgid.description') },
    {
      operator: 'has:userlabels',
      description: t('command_palette.search.has:userlabels.description')
    },
    {
      operator: 'has:nouserlabels',
      description: t('command_palette.search.has:nouserlabels.description')
    },
    { operator: 'is:muted', description: t('command_palette.search.is:mute.descriptiond') }
  ];

  // Update search state based on the latest query part.
  useEffect(() => {
    const queryParts = searchQuery.split(' ');
    const lastQueryPart = queryParts[queryParts.length - 1];
    setSearchState({
      currentQueryPart: lastQueryPart,
      showOperators: false // Don't show operators initially
    });
  }, [searchQuery]);

  // Initialize AI search state when component mounts
  // useEffect(() => {
  //   if (initialAiSearchMode) {
  //     onAiSearchStateChange?.(true, false);
  //   }
  // }, [initialAiSearchMode, onAiSearchStateChange]);

  // Reset AI search state when component unmounts
  useEffect(() => {
    return () => {
      onAiSearchStateChange?.(false, false);
    };
  }, []);

  // Filter operators based on the current query part.
  const getFilteredOperators = (queryPart: string) => {
    return allOperators.filter(
      (operator) => operator.operator.includes(queryPart) || queryPart.includes(operator.operator)
    );
  };

  const filteredOperators = getFilteredOperators(searchState.currentQueryPart);

  // Filter contacts based on the search query.
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return unpinnedContacts.filter(
      (contact) =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.emailAddress.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, unpinnedContacts]);

  // Function to perform the search.
  const performSearch = async (query: string, addToHistory = true) => {
    // Reset AI search states immediately
    setAiSearchMode(false);
    onAiSearchStateChange?.(false, false);

    closeDialog('commandPalette');
    searchNewQuery(query, undefined, addToHistory);
    // Track the search event.
    trackEvent('search_performed', {
      query,
      query_parts: query
        .trim()
        .split(' ')
        .filter((p) => p.length > 0).length
    });

    // Close the command palette
    setTimeout(() => {
      setSearchState({ currentQueryPart: '', showOperators: true });
      onClose();
    }, 300); // Reduced timeout for better responsiveness
  };

  // Function to perform AI search
  const performAiSearch = async (naturalLanguageQuery: string) => {
    if (!naturalLanguageQuery.trim()) return;

    // Get the first active account UID for the API call
    const activeAccountUid = activeSpace?.activeAccountUids?.[0];
    if (!activeAccountUid) {
      console.error('No active account found for AI search');
      return;
    }

    setAiSearchLoading(true);
    onAiSearchStateChange?.(aiSearchMode, true);
    try {
      const response = await mailApi.generateSearchQueries(activeAccountUid, {
        prompt: naturalLanguageQuery.trim()
      });

      if (response.query) {
        // Use the first (highest confidence) search query
        const bestQuery = response.query;

        trackEvent('ai_search_performed', {
          prompt: naturalLanguageQuery,
          generated_query: bestQuery,
          description: response.description
        });

        // Perform search with the generated query (this will reset AI state)
        performSearch(bestQuery);
      }
    } catch (error) {
      console.error('AI search error:', error);
      trackEvent('ai_search_error', {
        prompt: naturalLanguageQuery,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Reset AI search state on error
      setAiSearchMode(false);
      onAiSearchStateChange?.(false, false);
    } finally {
      setAiSearchLoading(false);
      // Only reset loading state here, not active state since performSearch will handle that
    }
  };

  // When an operator is selected, update the query and track the event.
  const handleOperatorSelect = (operator: string) => {
    const queryParts = searchQuery.split(' ');
    queryParts[queryParts.length - 1] = operator;
    const newQuery = queryParts.join(' ');
    setSearchState({
      currentQueryPart: operator,
      showOperators: false
    });
    setSearchQuery(newQuery);
    trackEvent('operator_selected', {
      operator,
      new_query: newQuery
    });
  };

  const countQueries = (query: string) => {
    return query
      .trim()
      .split(' ')
      .filter((part) => part.length > 0).length;
  };

  // Handler for initiating bookmark creation
  const handleBookmarkCreate = () => {
    onSelect();
    // Navigate to account selection page instead of directly to name page
    pushPage(['BOOKMARK_ACCOUNT']);
    trackEvent('bookmark_initiated', { query: searchQuery });
  };

  const commandListRef = useRef<HTMLDivElement>(null);
  const commandScrollListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(0);
  const [loading, setLoading] = useState(false);

  // Handle key events for AI search mode
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const newAiSearchMode = !aiSearchMode;
      setAiSearchMode(newAiSearchMode);
      onAiSearchStateChange?.(newAiSearchMode, aiSearchLoading);
      trackEvent('ai_search_mode_toggled', { enabled: newAiSearchMode });
      return;
    }

    if (aiSearchMode && e.key === 'Enter') {
      e.preventDefault();
      performAiSearch(searchQuery);
      return;
    }

    // Pass through to original handler for other keys
    onKeydown(e);
  };

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          const computedHeight = commandListRef.current.scrollHeight;
          setListHeight(computedHeight < 300 ? computedHeight : 300);
          // Reset scroll position to top when content changes
        }
      }, 0);
    }
  }, [searchState, filteredOperators, filteredContacts, loading, aiSearchMode]);

  // Additional effect to ensure scroll position stays at top when search query changes
  useEffect(() => {
    if (commandScrollListRef.current && !aiSearchMode) {
      // commandScrollListRef.current.scrollTop = 0;

      commandScrollListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [searchQuery, aiSearchMode]);

  return (
    <div className="relative">
      <EnhancedCommandInput
        placeholder={
          aiSearchMode
            ? t('command_palette.search.ai_placeholder', 'Ask in natural language...')
            : t('command_palette.search.placeholder')
        }
        autoFocus
        value={searchQuery}
        onValueChange={setSearchQuery}
        prepend={
          aiSearchMode ? (
            <div className="px-2">
              {aiSearchLoading ? <Loader /> : <MonoIcon type="Search" className="h-4 w-4" />}
            </div>
          ) : (
            <ShortcutKeyboard shortcut={'Tab'} className="px-2" />
          )
        }
        renderCondition={(part) => (aiSearchMode ? false : part.includes(':'))}
        onKeyDown={handleKeyDown}
      />
      <CommandList
        ref={commandScrollListRef}
        className={cn(
          'h-[0px] origin-top transition-all duration-200 ease-bouncy-in-out',
          loading || aiSearchMode ? '' : `h-[${listHeight}px]`
        )}
        style={{
          transition: 'height 300ms',
          height: aiSearchMode ? '0px' : `${listHeight}px`
        }}
      >
        <div ref={commandListRef}>
          {!aiSearchMode && countQueries(searchQuery) > 0 && (
            <CommandGroup heading={t('command_palette.header.search')} className="p-2">
              <CommandItem
                variant="raycast"
                value={searchQuery.trim()}
                onSelect={() => performSearch(searchQuery)}
              >
                <CommandIcon type="Search" />
                <span>{t('command_palette.search.query_search', { query: searchQuery })}</span>
              </CommandItem>

              <CommandItem
                variant="raycast"
                value={`${searchQuery.trim()}_bookmark`}
                onSelect={handleBookmarkCreate}
              >
                <CommandIcon type="Bookmark" />
                <span>{t('command_palette.search.save_bookmark', { query: searchQuery })}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {!aiSearchMode && filteredContacts.length > 0 && (
            <CommandGroup className="p-2">
              {filteredContacts.map((contact) => (
                <CommandItem
                  key={contact.emailAddress}
                  variant="raycast"
                  value={`${contact.displayName} ${contact.emailAddress}`}
                  onSelect={() => {
                    performSearch(`${contact.emailAddress}`, true);
                    trackEvent('contact_selected', {
                      contact_id: contact.emailAddress
                    });
                  }}
                >
                  <RecipientAvatar
                    recipient={{ email: contact.emailAddress, name: contact.displayName }}
                  />
                  <span className="ml-2">
                    {ellipsisString(contact.displayName)} (
                    {ellipsisEmailString(contact.emailAddress)})
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!aiSearchMode && searchHistory.length > 0 && (
            <CommandGroup
              heading={t('command_palette.header.recent_searches', 'Recent Searches')}
              className="p-2"
            >
              {searchHistory.map((historyQuery, index) => (
                <CommandItem
                  key={index}
                  variant="raycast"
                  value={historyQuery}
                  onSelect={() => performSearch(historyQuery, false)}
                  className="group"
                >
                  <CommandIcon type={'Clock'} />
                  <span className="flex-1">{historyQuery}</span>
                  <Button
                    variant={'ghost'}
                    sizeVariant={'xs'}
                    typeVariant={'icon'}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeFromSearchHistory(historyQuery);
                      trackEvent('search_history_removed', { query: historyQuery });
                    }}
                    title="Remove from search history"
                  >
                    <MonoIcon type={'X'} className="h-4 w-4" />
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!aiSearchMode && searchQuery.trim() !== '' && (
            <CommandGroup heading={t('command_palette.header.operators')} className="p-2">
              {filteredOperators
                .map((operator, index) => {
                  if (
                    searchState.currentQueryPart.trim() !== operator.operator &&
                    !searchState.currentQueryPart.trim().includes(operator.operator)
                  )
                    return (
                      <CommandItem
                        key={index}
                        variant="raycast"
                        value={searchQuery + ' ' + operator.operator}
                        onSelect={() => {
                          handleOperatorSelect(operator.operator);
                          onSelect();
                        }}
                      >
                        <span className="grid grid-cols-1">
                          <div className="flex items-center">
                            {/* <CommandIcon type={'Search'} /> */}
                            <span className="mr-2 w-48 whitespace-nowrap">
                              <span
                                className={cn(
                                  "rounded-md bg-primary/15 px-2 py-1 group-data-[selected='true']:text-foreground"
                                )}
                              >
                                {operator.operator}
                              </span>
                            </span>
                            <span className="flex-1 whitespace-normal">{operator.description}</span>
                          </div>
                        </span>
                      </CommandItem>
                    );
                  return null;
                })
                .filter(Boolean)}
            </CommandGroup>
          )}
        </div>
      </CommandList>
    </div>
  );
};

export default SearchCommandPage;
