import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/renderer/app/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle
} from '@/renderer/app/components/ui/dialog';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import BookmarkAccountPage from '@/renderer/app/containers/command/bookmark/BookmarkAccountPage'; // Import new component
import BookmarkIconPage from '@/renderer/app/containers/command/bookmark/BookmarkIconPage';
import BookmarkNamePage from '@/renderer/app/containers/command/bookmark/BookmarkNamePage';
import LabelCommandPage from '@/renderer/app/containers/command/LabelCommandPage';
import MoveCommandPage from '@/renderer/app/containers/command/MoveCommandPage';
import PinContactPage from '@/renderer/app/containers/command/PinContactPage';
import ReminderCommandPage from '@/renderer/app/containers/command/ReminderCommandPage';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { cn } from '@/renderer/app/lib/utils';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { CommandType } from '@/renderer/app/types';
import React, { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import SearchCommandPage from './SearchCommandPage'; // Adjust the import path as needed
// Import thread state to check the labels for paired commands.
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useTranslation } from 'react-i18next';
import SpaceCommandPage from '@/renderer/app/containers/command/space/SpaceCommandPage';

interface CommandPaletteProps {
  overlay?: boolean;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pages: string[];
  setPages: (pages: string[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  bookmarkName: string;
  setBookmarkName: (name: string) => void;
  bookmarkIcon: string;
  setBookmarkIcon: (icon: string) => void;
  pinContact: string;
  setPinContact: (name: string) => void;
  selectedAccountId: string; // Add new prop for selectedAccountId
  setSelectedAccountId: (accountId: string) => void; // Add setter for selectedAccountId
  selectedSpaceId?: string; // Add new prop for selectedSpaceId
  setSelectedSpaceId: (spaceId: string | undefined) => void; // Add setter for selectedSpaceId
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  pages,
  setPages,
  searchQuery = '',
  setSearchQuery,
  bookmarkName = '',
  setBookmarkName,
  bookmarkIcon = '',
  setBookmarkIcon,
  pinContact = '',
  setPinContact,
  selectedAccountId = '',
  setSelectedAccountId,
  selectedSpaceId,
  setSelectedSpaceId,
  overlay = true
}) => {
  const { t } = useTranslation();
  const [reminderValue, setReminderValue] = useState('');
  const [labelValue, setLabelValue] = useState('');
  const [moveValue, setMoveValue] = useState('');
  const [commandInput, setCommandInput] = useState('');

  const { globalSearchQuery } = useGlobalAtom();
  const { activeScopes } = useHotkeyScope();
  const commands = useCommands();
  const { preference } = useAuth();
  const { theme, setTheme } = useTheme();
  const executeCommand = useExecuteCommand();
  const { dialogState } = useDialogs();

  // Get thread state (selected threads and thread map) for filtering paired commands.
  const { selectedThreads, threadsMap } = useThreadAtom();

  // Determine the active page based on the pages array.
  const activePage = pages[pages.length - 1];

  const pushPage = (newPage: string[]) => {
    bounce();
    setTimeout(() => {
      setPages([...pages, ...newPage]);
    }, 150);
  };

  const popPage = useCallback(() => {
    const x = [...pages];
    x.splice(-1, 1);
    setPages(x);
  }, [pages, setPages]);

  const ref = useRef<HTMLDivElement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const bounce = () => {
    if (ref.current) {
      setIsAnimating(true);
      setTimeout(() => {
        setIsAnimating(false);
      }, 150);
    }
  };

  const handleSelect = async (commandId: CommandType) => {
    const actionResult: void | 'page' = await executeCommand(commandId);
    if (actionResult === 'page') {
      switch (commandId) {
        case 'SIDEBAR_FAVORITE_ADD':
          setCommandInput(globalSearchQuery);
          // Updated to start with account selection
          pushPage(['SEARCH', 'BOOKMARK_ACCOUNT']);
          break;
        default:
          pushPage([commandId]);
      }
    } else {
      setPages([]);
      setCommandInput('');
      onOpenChange(false);
    }
  };

  const handleOnClose = () => {
    setSearchQuery('');
    setCommandInput('');
    setBookmarkName('');
    setSelectedAccountId(''); // Reset selected account
    setSelectedSpaceId(undefined); // Reset selected space
    setPages([]);
    setReminderValue('');
    setMoveValue('');
  };

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(300);
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          const computedHeight = commandListRef.current.scrollHeight;
          setListHeight(computedHeight < 300 ? computedHeight : 300); // Limit to max height
        }
      }, 0);
    }
  }, [commandInput, loading]);

  /* 
    Helper logic for paired commands.
    In our commands catalog we have the following pairs:
    - THREAD_MARK_READ vs THREAD_MARK_UNREAD:
      • Show "Mark as read" if the thread is unread.
      • Otherwise, show "Mark as unread".
    - THREAD_STAR vs THREAD_UNSTAR:
      • If the thread is starred, show "Unstar", else show "Star".
    - THREAD_TRASH vs THREAD_UNTRASH:
      • If the thread is in trash, show "Restore from Trash", else show "Trash".
    
    If you need to add more pairs later, add their IDs to the pairedCommandIds set
    and extend the switch below.
  */

  // Get the first selected thread (if any) to determine paired command conditions.
  const firstSelectedThread =
    selectedThreads && selectedThreads.length > 0 ? threadsMap[selectedThreads[0]] : null;

  const groupedCommandIds: Record<string, string[]> = {
    THREAD_MARK: ['THREAD_MARK_READ', 'THREAD_MARK_UNREAD'],
    THREAD_DONE: ['THREAD_DONE', 'THREAD_UNDONE'],
    THREAD_STAR: ['THREAD_STAR', 'THREAD_UNSTAR'],
    THREAD_TRASH: ['THREAD_TRASH', 'THREAD_UNTRASH'],
    THEME_TOGGLE: [
      'TOGGLE_THEME_LIGHT',
      'TOGGLE_THEME_PURE_LIGHT',
      'TOGGLE_THEME_DARK',
      'TOGGLE_THEME_BLACK',
      'TOGGLE_THEME_SYSTEM'
    ],
    DENSITY_TOGGLE: ['TOGGLE_DENSITY_COMPACT', 'TOGGLE_DENSITY_COZY']
  };

  const shouldShowGroupedCommand = (command: { commandId: string }) => {
    for (const group in groupedCommandIds) {
      if (groupedCommandIds[group].includes(command.commandId)) {
        switch (group) {
          case 'THREAD_MARK':
            return firstSelectedThread
              ? command.commandId !==
                  (firstSelectedThread.labelIds.includes('UNREAD')
                    ? 'THREAD_MARK_UNREAD'
                    : 'THREAD_MARK_READ')
              : true;

          case 'THREAD_STAR':
            return firstSelectedThread
              ? command.commandId !==
                  (firstSelectedThread.labelIds.includes('STARRED')
                    ? 'THREAD_STAR'
                    : 'THREAD_UNSTAR')
              : true;

          case 'THREAD_DONE':
            return firstSelectedThread
              ? command.commandId !==
                  (firstSelectedThread.labelIds.includes('INBOX') ? 'THREAD_UNDONE' : 'THREAD_DONE')
              : true;

          case 'THREAD_TRASH':
            return firstSelectedThread
              ? command.commandId !==
                  (firstSelectedThread.labelIds.includes('TRASH')
                    ? 'THREAD_TRASH'
                    : 'THREAD_UNTRASH')
              : true;

          case 'THEME_TOGGLE':
            return (
              command.commandId !==
              (theme === 'light'
                ? 'TOGGLE_THEME_LIGHT'
                : theme === 'pure-light'
                  ? 'TOGGLE_THEME_PURE_LIGHT'
                  : theme === 'dark'
                    ? 'TOGGLE_THEME_DARK'
                    : theme === 'black'
                      ? 'TOGGLE_THEME_BLACK'
                      : 'TOGGLE_THEME_SYSTEM')
            );

          case 'DENSITY_TOGGLE':
            return (
              command.commandId !==
              (preference.appearance.density === 'compact'
                ? 'TOGGLE_DENSITY_COMPACT'
                : 'TOGGLE_DENSITY_COZY')
            );

          default:
            return true;
        }
      }
    }

    return true; // Default to showing commands that are not in a grouped set.
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {overlay && <DialogOverlay className="bg-transparent backdrop-blur-sm" />}

        <DialogContent
          aria-describedby=""
          closeButton={false}
          className={cn(
            `rounded-xl border border-card bg-card p-0 shadow-3xl shadow-black/50 transition-all duration-150 ease-bouncy-in-out dark:border-foreground/20 dark:shadow-white/50`,
            isAnimating ? 'scale-[0.99] shadow-4xl' : 'scale-100 shadow-3xl'
          )}
          ref={ref}
        >
          <DialogTitle className="hidden"></DialogTitle>
          <Command className={'rounded-xl bg-card transition-transform'}>
            {/* <div className="ml-4 mt-4 flex gap-2">
              <div
                data-cmdk-vercel-badge=""
                className="rounded-lg bg-muted-low p-1 px-2 text-sm text-foreground"
              >
                Home
              </div>
              {pages.map((p) => (
                <div
                  key={p}
                  data-cmdk-vercel-badge=""
                  className="rounded-lg bg-muted-low p-1 px-2 text-sm text-foreground"
                >
                  {p
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </div>
              ))}
            </div> */}

            {activePage === 'SEARCH' && (
              <SearchCommandPage
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onClose={handleOnClose}
                onSelect={() => {
                  bounce();
                }}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && searchQuery === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
                pushPage={pushPage}
              />
            )}

            {/* Add new BookmarkAccountPage component */}
            {activePage === 'BOOKMARK_ACCOUNT' && (
              <BookmarkAccountPage
                selectedAccountId={selectedAccountId}
                setSelectedAccountId={setSelectedAccountId}
                onClose={handleOnClose}
                bounce={bounce}
                pushPage={pushPage}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && selectedAccountId === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}

            {activePage === 'BOOKMARK_NAME' && (
              <BookmarkNamePage
                searchQuery={searchQuery}
                bookmarkName={bookmarkName}
                selectedAccountId={selectedAccountId}
                setBookmarkName={setBookmarkName}
                onClose={handleOnClose}
                pushPage={pushPage}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && bookmarkName === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
                bounce={bounce}
              />
            )}

            {activePage === 'BOOKMARK_ICON' && (
              <BookmarkIconPage
                searchQuery={searchQuery}
                bookmarkName={bookmarkName}
                selectedAccountId={selectedAccountId} // Pass selected account ID
                setBookmarkIcon={setBookmarkIcon}
                bookmarkIcon={bookmarkIcon}
                onClose={handleOnClose}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && bookmarkIcon === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
                bounce={bounce}
              />
            )}

            {activePage === 'PIN_CONTACT' && (
              <PinContactPage
                onClose={handleOnClose}
                bounce={bounce}
                onSelect={() => {
                  bounce();
                }}
                pinContact={pinContact}
                setPinContact={setPinContact}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && pinContact === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}

            {activePage === 'REMINDER' && (
              <ReminderCommandPage
                reminderValue={reminderValue}
                setReminderValue={setReminderValue}
                onClose={handleOnClose}
                bounce={bounce}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && reminderValue === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}

            {activePage === 'LABEL' && (
              <LabelCommandPage
                labelValue={labelValue}
                setLabelValue={setLabelValue}
                onClose={handleOnClose}
                bounce={bounce}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && labelValue === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}

            {activePage === 'MOVE' && (
              <MoveCommandPage
                moveValue={moveValue}
                setMoveValue={setMoveValue}
                onClose={handleOnClose}
                bounce={bounce}
                onOpenChange={onOpenChange}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && moveValue === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}

            {activePage === 'SPACE' && (
              <SpaceCommandPage
                selectedSpaceId={selectedSpaceId}
                onClose={handleOnClose}
                bounce={bounce}
                onKeydown={(e) => {
                  if (e.key === 'Backspace' && e.currentTarget.value === '') {
                    e.preventDefault();
                    bounce();
                    setTimeout(() => {
                      popPage();
                    }, 150);
                    if (pages.length === 0) {
                      onOpenChange(false);
                    }
                  }
                }}
              />
            )}
            {/* When no "page" is active, render the main command list */}
            {!activePage && (
              <>
                <EnhancedCommandInput
                  placeholder={t('command_palette.placeholder')}
                  autoFocus
                  value={commandInput}
                  onValueChange={setCommandInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && commandInput === '') {
                      e.preventDefault();
                      bounce();
                      if (pages.length === 0) {
                        onOpenChange(false);
                      }
                    }
                  }}
                />
                <CommandList
                  className={cn(
                    'h-[300px] origin-top transition-all duration-200 ease-bouncy-in-out',
                    loading ? '' : `h-[${listHeight}px]`
                  )}
                  style={{ transition: 'height 300ms', height: `${listHeight}px` }}
                >
                  <div ref={commandListRef}>
                    <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
                    <CommandGroup
                      heading={t('command_palette.header.commands')}
                      className="my-1 p-2"
                    >
                      {Object.keys(commands)
                        .map((commandId) => ({
                          ...commands[commandId as keyof typeof commands],
                          commandId
                        }))
                        // Only show commands whose scope is active.
                        .filter((command) => activeScopes.includes(command.scope))
                        // For commands that come in paired sets, check the condition.
                        .filter((command) => shouldShowGroupedCommand(command))
                        .map((command) => (
                          <CommandItem
                            key={command.commandId}
                            className="group"
                            variant={'raycast'}
                            onSelect={() => handleSelect(command.commandId as CommandType)}
                          >
                            {command.icon && <CommandIcon type={command.icon} />}
                            <span>{command.title}</span>
                            {command.hotkeys && command.hotkeys.length > 0 && (
                              <CommandShortcut shortcut={command.hotkeys[0]} />
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </div>
                </CommandList>
              </>
            )}

            {/* <div className="flex items-center border-t border-border/50 bg-card p-3">
              <div className="ml-auto flex items-center">
                <button className="font-regular flex items-center gap-2 text-sm text-muted-foreground">
                  {t('command_palette.enter')}
                  <ShortcutKeyboard shortcut={'ENTER'} />
                </button>
              </div>
            </div> */}
          </Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default CommandPalette;
