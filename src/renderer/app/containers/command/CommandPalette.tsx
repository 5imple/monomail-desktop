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
import MonoIcon from '@/renderer/app/components/icons/icons';
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
import { CommandType } from '@/renderer/app/types';
import React, { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import SearchCommandPage from './SearchCommandPage'; // Adjust the import path as needed
// Import thread state to check the labels for paired commands.
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { isBackendConfigured } from '@/main/api/apiClient';
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

// Commands that open a page of their own: they get a trailing chevron so they
// don't read as immediate actions.
const PAGE_COMMANDS = new Set<string>([
  'SEARCH',
  'SPACE',
  'PIN_CONTACT',
  'LABEL',
  'MOVE',
  'REMINDER',
  'SIDEBAR_FAVORITE_ADD'
]);

// What people type for these, Outlook and Gmail vocabulary included: the
// titles alone ("Done", "Reminder", "Move") found nothing for "archive",
// "snooze", "delete" or "folder".
const COMMAND_KEYWORDS: Partial<Record<CommandType, string[]>> = {
  THREAD_DONE: ['archive', 'done'],
  THREAD_UNDONE: ['unarchive', 'move to inbox'],
  THREAD_TRASH: ['delete', 'remove', 'bin'],
  THREAD_UNTRASH: ['restore', 'undelete'],
  THREAD_REPORT_SPAM: ['junk'],
  THREAD_MARK_READ: ['read', 'seen'],
  THREAD_MARK_UNREAD: ['unread', 'new'],
  THREAD_STAR: ['flag', 'favorite'],
  THREAD_UNSTAR: ['unflag'],
  REMINDER: ['snooze', 'later', 'remind', 'reminder', 'follow up'],
  MOVE: ['folder', 'file', 'move to'],
  LABEL: ['tag', 'category'],
  SPACE: ['workspace', 'switch'],
  SEARCH: ['find', 'look up'],
  GOTO_INBOX: ['inbox', 'primary', 'home'],
  COMPOSE_NEW_MESSAGE: ['write', 'new email', 'new message'],
  COMPOSE_REPLY_MESSAGE: ['respond'],
  COMPOSE_REPLY_ALL_MESSAGE: ['respond all'],
  COMPOSE_FORWARD_MESSAGE: ['fw', 'fwd', 'share'],
  GOTO_DONE: ['archive'],
  GOTO_STARRED: ['flagged'],
  OPEN_PREFERENCES: ['settings', 'preferences', 'options'],
  OPEN_FEEDBACK: ['bug', 'report', 'help', 'support'],
  OPEN_LOG_FOLDER: ['logs', 'debug'],
  TOGGLE_THEME_LIGHT: ['theme', 'light mode', 'appearance'],
  TOGGLE_THEME_PURE_LIGHT: ['theme', 'light mode', 'appearance'],
  TOGGLE_THEME_DARK: ['theme', 'dark mode', 'appearance'],
  TOGGLE_THEME_BLACK: ['theme', 'dark mode', 'appearance'],
  TOGGLE_THEME_SYSTEM: ['theme', 'appearance', 'auto'],
  TOGGLE_DENSITY_COMPACT: ['density', 'spacing'],
  TOGGLE_DENSITY_COZY: ['density', 'spacing', 'comfortable']
};

// The root list in sections (it was one flat "Commands" group in catalog
// order, so "Pin Contact" came first). Conversation actions lead.
type RootGroup = 'conversation' | 'compose' | 'goto' | 'settings' | 'appearance' | 'other';
const ROOT_GROUP_ORDER: RootGroup[] = [
  'conversation',
  'compose',
  'goto',
  'settings',
  'appearance',
  'other'
];
const rootGroupOf = (commandId: string): RootGroup => {
  if (commandId.startsWith('TOGGLE_THEME_') || commandId.startsWith('TOGGLE_DENSITY_')) {
    return 'appearance';
  }
  if (commandId.startsWith('OPEN_')) return 'settings';
  if (commandId === 'COMPOSE_NEW_MESSAGE') return 'compose';
  if (
    commandId.startsWith('GOTO_') ||
    ['SEARCH', 'SPACE', 'PIN_CONTACT', 'SIDEBAR_FAVORITE_ADD'].includes(commandId)
  ) {
    return 'goto';
  }
  if (
    commandId.startsWith('THREAD_') ||
    commandId.startsWith('COMPOSE_') ||
    ['REMINDER', 'LABEL', 'MOVE', 'DISCARD_DRAFT'].includes(commandId)
  ) {
    return 'conversation';
  }
  return 'other';
};

// A value no typed text can match: the "Search mail for …" fallback scores 0,
// so it always sorts last and is only selected when nothing else matches.
const SEARCH_FALLBACK_VALUE = '⁣';

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
  const { theme } = useTheme();
  const executeCommand = useExecuteCommand();
  const { spaces, activeSpace } = useSpaceAtom();

  // Get thread state (selected threads and thread map) for filtering paired commands.
  const { activeThreadId, selectedThreads, threadsMap } = useThreadAtom();

  // Determine the active page based on the pages array.
  const activePage = pages[pages.length - 1];

  // Page changes are immediate (bounce runs alongside): a 150ms wait sent the
  // first keys typed on the new page to the old page's input.
  const pushPage = (newPage: string[]) => {
    bounce();
    setPages([...pages, ...newPage]);
  };

  const popPage = useCallback(() => {
    const x = [...pages];
    x.splice(-1, 1);
    setPages(x);
  }, [pages, setPages]);

  // Label → Move swap, so Backspace from Move returns to where Label was.
  const replaceTopPage = useCallback(
    (page: string) => {
      setPages([...pages.slice(0, -1), page]);
    },
    [pages, setPages]
  );

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

  // Backspace in an empty field steps back one page. Held, it steps back at
  // most once (repeats are swallowed): running out of the palette sent the
  // next repeat to the reader, where Backspace trashes the open thread.
  const stepBackOnBackspace = (e: React.KeyboardEvent<HTMLInputElement>, isEmpty: boolean) => {
    if (e.key !== 'Backspace' || !isEmpty) return;
    e.preventDefault();
    if (e.repeat) return;
    bounce();
    popPage();
  };

  // With a single account in the space there's nothing to choose.
  const onlyAccountId =
    activeSpace?.activeAccountUids?.length === 1 ? activeSpace.activeAccountUids[0] : '';

  const handleSelect = async (commandId: CommandType) => {
    const actionResult: void | 'page' = await executeCommand(commandId);
    if (actionResult === 'page') {
      switch (commandId) {
        case 'SIDEBAR_FAVORITE_ADD':
          // Bookmark the current search (it set the root input, so the
          // bookmark was saved for an empty query).
          setSearchQuery(globalSearchQuery);
          if (onlyAccountId) {
            setSelectedAccountId(onlyAccountId);
            pushPage(['SEARCH', 'BOOKMARK_NAME']);
          } else {
            pushPage(['SEARCH', 'BOOKMARK_ACCOUNT']);
          }
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

  // The palette stays mounted between opens, and Esc / outside-click only
  // flip `open` without running handleOnClose — so the next open showed the
  // previous reminder/label/move text, ready to be re-submitted with Enter.
  useEffect(() => {
    if (open) return;
    setReminderValue('');
    setLabelValue('');
    setMoveValue('');
    setCommandInput('');
  }, [open]);

  const handleOnClose = () => {
    setSearchQuery('');
    setCommandInput('');
    setBookmarkName('');
    // Left set, the next visit opened pre-filtered (a hidden icon, old Pin text).
    setBookmarkIcon('');
    setPinContact('');
    setSelectedAccountId(''); // Reset selected account
    setSelectedSpaceId(undefined); // Reset selected space
    setPages([]);
    setReminderValue('');
    setLabelValue('');
    setMoveValue('');
  };

  // For flows that are finished (a Space created or deleted): reset and close.
  // handleOnClose alone left the palette open on the root list.
  const closePalette = () => {
    handleOnClose();
    onOpenChange(false);
  };

  const commandListRef = useRef<HTMLDivElement>(null);
  // Unmeasured → natural height (capped by max-h): starting at a fixed 300px
  // made every page open tall and then collapse.
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);
  // The root list gets more room in the full palette (about 5 rows showed);
  // onboarding's inline palette keeps 300px.
  const rootListCap = overlay ? 440 : 300;

  useLayoutEffect(() => {
    setTimeout(() => {
      if (commandListRef.current) {
        const computedHeight = commandListRef.current.scrollHeight;
        const cap = overlay
          ? Math.min(rootListCap, Math.round(window.innerHeight * 0.5))
          : rootListCap;
        setListHeight(Math.min(computedHeight, cap)); // Limit to max height
      }
    }, 0);
  }, [commandInput]);

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

  // The thread the paired commands will act on — the open one first, like
  // the executor (a leftover hidden selection must not decide the label).
  const targetThreadId = activeThreadId ?? selectedThreads?.[0];
  const firstSelectedThread = targetThreadId ? (threadsMap[targetThreadId] ?? null) : null;
  const targetCount = activeThreadId ? 1 : (selectedThreads?.length ?? 0);

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

  // Spaces can only be created or edited with a backend that loads them; the
  // standalone build has just the built-in Inbox space, so "Space" led only
  // to flows that fail (as the sidebar's "+ Space" did).
  const canManageSpaces = isBackendConfigured() && !spaces.some((s) => s.id === 'local-space');
  const hideSpaceCommand = !canManageSpaces && spaces.length <= 1;
  // Pinned contacts and saved searches live on the backend too; without one
  // their pages end in "Failed to…" after the user has filled them in.
  const backendOnlyCommands = new Set<string>(['PIN_CONTACT', 'SIDEBAR_FAVORITE_ADD']);
  const hideBackendOnly = !isBackendConfigured();

  const rootCommands = Object.keys(commands)
    .map((commandId) => ({
      ...commands[commandId as keyof typeof commands],
      commandId
    }))
    // Only show commands whose scope is active.
    .filter((command) => activeScopes.includes(command.scope))
    // For commands that come in paired sets, check the condition.
    .filter((command) => shouldShowGroupedCommand(command))
    .filter((command) => !(hideSpaceCommand && command.commandId === 'SPACE'))
    .filter((command) => !(hideBackendOnly && backendOnlyCommands.has(command.commandId)));

  const rootGroupHeadings: Record<RootGroup, string> = {
    conversation: t('command_palette.group.conversation'),
    compose: t('command_palette.group.compose'),
    goto: t('command_palette.group.go_to'),
    settings: t('command_palette.group.settings'),
    appearance: t('command_palette.group.appearance'),
    other: t('command_palette.header.commands')
  };

  // Where you are on a sub-page, and that Backspace goes back (the placeholder
  // was the only cue, and it vanished on the first keystroke).
  const pageContext: Record<string, string> = {
    LABEL: t('command_palette.context.label', { count: targetCount }),
    MOVE: t('command_palette.context.move', { count: targetCount }),
    REMINDER: t('command_palette.context.reminder', { count: targetCount }),
    SPACE: t('command_palette.context.space'),
    PIN_CONTACT: t('command_palette.context.pin'),
    BOOKMARK_ACCOUNT: t('command_palette.context.bookmark'),
    BOOKMARK_NAME: t('command_palette.context.bookmark'),
    BOOKMARK_ICON: t('command_palette.context.bookmark')
  };
  const contextLabel = activePage ? pageContext[activePage] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* no-drag: under the titlebar strip a click on the backdrop dragged
            the window instead of dismissing the palette. */}
        {overlay && <DialogOverlay className="no-drag bg-transparent backdrop-blur-sm" />}

        <DialogContent
          aria-describedby=""
          closeButton={false}
          className={cn(
            // Same hairline as other popovers; a dark shadow in every theme
            // (dark mode drew an 80px white glow under it).
            `rounded-xl border border-border/60 bg-card p-0 shadow-black/50 transition-all duration-150 ease-bouncy-in-out dark:shadow-black/80`,
            // Anchored near the top so the list only grows downward — centred,
            // the input jumped every time the list changed height. The enter /
            // exit slide is cut down to a few px from the base dialog's 48%.
            overlay &&
              'top-[14vh] translate-y-0 data-[state=open]:[--tw-enter-translate-y:-8px] data-[state=closed]:[--tw-exit-translate-y:-8px]',
            isAnimating ? 'scale-[0.99] shadow-4xl' : 'scale-100 shadow-3xl'
          )}
          ref={ref}
        >
          <DialogTitle className="sr-only">{t('command_palette.title')}</DialogTitle>
          <Command
            className={cn(
              'rounded-xl bg-card transition-transform',
              // The keyboard cursor: a foreground tint reads in every theme
              // (bg-muted was ~1.04:1 on pure-light). Danger rows keep theirs.
              '[&_[cmdk-item][data-selected=true]:not([data-danger])]:bg-foreground/[0.07]'
            )}
          >
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

            {contextLabel && (
              <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
                <span className="truncate">{contextLabel}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <ShortcutKeyboard variant="flat" sizeVariant="xs" shortcut={'BACKSPACE'} />
                  {t('command_palette.context.back')}
                </span>
              </div>
            )}

            {activePage === 'SEARCH' && (
              <SearchCommandPage
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onClose={handleOnClose}
                onSelect={() => {
                  bounce();
                }}
                onKeydown={(e) => stepBackOnBackspace(e, searchQuery === '')}
                pushPage={pushPage}
                onlyAccountId={onlyAccountId}
                setSelectedAccountId={setSelectedAccountId}
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
                // The page's own filter: Backspace in a typed filter like
                // "wash" used to leave the page.
                onKeydown={(e) => stepBackOnBackspace(e, e.currentTarget.value === '')}
              />
            )}

            {activePage === 'BOOKMARK_NAME' && (
              <BookmarkNamePage
                searchQuery={searchQuery}
                bookmarkName={bookmarkName}
                selectedAccountId={selectedAccountId || onlyAccountId}
                setBookmarkName={setBookmarkName}
                onClose={handleOnClose}
                pushPage={pushPage}
                onChooseAccount={() => setPages(['SEARCH', 'BOOKMARK_ACCOUNT'])}
                onKeydown={(e) => stepBackOnBackspace(e, bookmarkName === '')}
                bounce={bounce}
              />
            )}

            {activePage === 'BOOKMARK_ICON' && (
              <BookmarkIconPage
                searchQuery={searchQuery}
                bookmarkName={bookmarkName}
                selectedAccountId={selectedAccountId || onlyAccountId} // Pass selected account ID
                setBookmarkIcon={setBookmarkIcon}
                bookmarkIcon={bookmarkIcon}
                onClose={handleOnClose}
                onKeydown={(e) => stepBackOnBackspace(e, bookmarkIcon === '')}
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
                onKeydown={(e) => stepBackOnBackspace(e, pinContact === '')}
              />
            )}

            {activePage === 'REMINDER' && (
              <ReminderCommandPage
                reminderValue={reminderValue}
                setReminderValue={setReminderValue}
                onClose={handleOnClose}
                bounce={bounce}
                onKeydown={(e) => stepBackOnBackspace(e, reminderValue === '')}
              />
            )}

            {activePage === 'LABEL' && (
              <LabelCommandPage
                labelValue={labelValue}
                setLabelValue={setLabelValue}
                onClose={handleOnClose}
                bounce={bounce}
                onSwitchToMove={() => replaceTopPage('MOVE')}
                onKeydown={(e) => stepBackOnBackspace(e, labelValue === '')}
              />
            )}

            {activePage === 'MOVE' && (
              <MoveCommandPage
                moveValue={moveValue}
                setMoveValue={setMoveValue}
                onClose={handleOnClose}
                bounce={bounce}
                onOpenChange={onOpenChange}
                onKeydown={(e) => stepBackOnBackspace(e, moveValue === '')}
              />
            )}

            {activePage === 'SPACE' && (
              <SpaceCommandPage
                selectedSpaceId={selectedSpaceId}
                onClose={handleOnClose}
                closePalette={closePalette}
                bounce={bounce}
                onKeydown={(e) => stepBackOnBackspace(e, e.currentTarget.value === '')}
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
                    // Empty: just a bounce. Closing here let the next press
                    // (or a held key's repeat) trash the open thread.
                    if (e.key === 'Backspace' && commandInput === '') {
                      e.preventDefault();
                      if (!e.repeat) bounce();
                    }
                  }}
                />
                <CommandList
                  className={cn(
                    'origin-top transition-all duration-200 ease-bouncy-in-out',
                    overlay && 'max-h-[440px]'
                  )}
                  style={
                    listHeight === undefined
                      ? { transition: 'height 300ms' }
                      : { transition: 'height 300ms', height: `${listHeight}px` }
                  }
                >
                  <div ref={commandListRef}>
                    {!commandInput.trim() && (
                      <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
                    )}
                    {ROOT_GROUP_ORDER.map((group) => {
                      const groupCommands = rootCommands.filter(
                        (command) => rootGroupOf(command.commandId) === group
                      );
                      if (groupCommands.length === 0) return null;
                      return (
                        <CommandGroup
                          key={group}
                          heading={rootGroupHeadings[group]}
                          className="my-1 p-2"
                        >
                          {groupCommands.map((command) => (
                            <CommandItem
                              key={command.commandId}
                              className="group"
                              variant={'raycast'}
                              keywords={COMMAND_KEYWORDS[command.commandId as CommandType]}
                              onSelect={() => handleSelect(command.commandId as CommandType)}
                            >
                              {command.icon && <CommandIcon type={command.icon} />}
                              <span>{command.title}</span>
                              {command.hotkeys && command.hotkeys.length > 0 && (
                                <CommandShortcut shortcut={command.hotkeys[0]} />
                              )}
                              {PAGE_COMMANDS.has(command.commandId) && (
                                <MonoIcon
                                  type="ChevronRight"
                                  className={cn(
                                    'h-4 w-4 shrink-0 text-muted-foreground',
                                    command.hotkeys?.length ? 'ml-2' : 'ml-auto'
                                  )}
                                />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      );
                    })}
                    {/* Text that matches no command: search mail for it
                        instead of a dead "No results found." */}
                    {commandInput.trim() && (
                      <CommandGroup forceMount className="my-1 p-2">
                        <CommandItem
                          forceMount
                          variant={'raycast'}
                          value={SEARCH_FALLBACK_VALUE}
                          onSelect={() => {
                            setSearchQuery(commandInput.trim());
                            pushPage(['SEARCH']);
                          }}
                        >
                          <CommandIcon type="Search" />
                          <span className="truncate">
                            {t('command_palette.search_mail_for', { query: commandInput.trim() })}
                          </span>
                        </CommandItem>
                      </CommandGroup>
                    )}
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
