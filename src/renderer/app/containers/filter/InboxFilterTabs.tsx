import {
  closestCenter,
  DndContext,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { useAtom, useSetAtom } from 'jotai';
import { generateUUID } from '@/main/utils';
import type { FilterCriteria } from '@/renderer/app/types';
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import CustomLabelDialog from '@/renderer/app/containers/filter/CustomLabelDialog';
import FilterOptionDropdownMenu from '@/renderer/app/containers/filter/FilterOptionDropdownMenu';
import RefreshMailButton from '@/renderer/app/containers/filter/RefreshMailButton';
import {
  sameFilters,
  splitLabelsFor,
  teamDomainsFor,
  unreadCountForTab
} from '@/renderer/app/lib/threadFilters';
import { SPLIT_COLOR_BG, nextSplitColor, withSplitColors } from '@/renderer/app/lib/splitColors';
import type { SplitColor } from '@/renderer/app/lib/splitColors';
import { setSplitCycler } from '@/renderer/app/lib/splitCycle';
import { useAuth } from '@/renderer/app/context/AuthContext';
import {
  BUILT_IN_TAB_IDS,
  BUILT_IN_TAB_RULES,
  clampTabDragX,
  moveTabId,
  orderTabIds
} from '@/renderer/app/lib/filterTabOrder';
import {
  customLabelEditorAtom,
  customLabelsAtom,
  filterTabOrderAtom,
  type CustomLabel
} from '@/renderer/app/store/thread/atoms';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadFilter } from '@/renderer/app/store/thread/useThreadFilter';
import { cn } from '@/renderer/app/lib/utils';

/**
 * Newton-style quick-filter tabs that live under the inbox title.
 *
 *   [All]   Unread   With attachments
 *     ───
 *
 * Three quick filters (All / Unread / With attachments) cover the most
 * common triage gestures with a single click. The full FilterOptionDropdownMenu
 * sits at the end of the same row for advanced filtering (date ranges,
 * calendar invitations, specific labels, etc.); the tabs are an opinionated
 * shortcut layer on top.
 *
 * The tabs read + mutate the same `activeFilters` atom the dropdown uses,
 * so toggling between dropdown and tabs stays coherent.
 *
 * After them come the user's custom labels (saved rule sets, see
 * CustomLabelDialog) and a "+" to make one. Any tab can be dragged to any
 * place in the row; right-click a tab to move it, and a custom label also to
 * edit or delete it (double-click edits it too).
 *
 * Together they are the Split Inbox: each label has a colour (the dot before
 * its name), every tab shows how many unread conversations it holds, Tab /
 * Shift+Tab on the list move between them, and Others, Calendar and Team are
 * made once by themselves as "only show here" splits.
 */

// What Outlook's Focused Inbox sorts into Other (newsletters, marketing,
// notifications): added once as an "Others" label, which can be renamed,
// moved or deleted like any other.
const OTHERS_RULES: FilterCriteria[] = [{ type: 'inbox_type', operator: 'is', value: 'other' }];
const OTHERS_ADDED_KEY = 'global:filter:customLabels:othersAdded';
// Others first came as a plain extra tab; it now takes its mail out of All
// (Outlook's Other). Turned on once for a label added before that, so
// turning it off later sticks.
const OTHERS_SPLIT_KEY = 'global:filter:customLabels:othersSplit';
// Calendar invites and mail from colleagues: Superhuman's automatic splits.
// Made once each, like Others, so deleting one sticks.
const CALENDAR_RULES: FilterCriteria[] = [{ type: 'calendar', operator: 'has' }];
const CALENDAR_ADDED_KEY = 'global:filter:customLabels:calendarAdded';
const TEAM_ADDED_KEY = 'global:filter:customLabels:teamAdded';

/** Adds a label unless one with the same rules or name is there already. */
const addLabelOnce = (
  current: CustomLabel[],
  label: Omit<CustomLabel, 'id' | 'color'>
): CustomLabel[] =>
  current.some(
    (l) =>
      sameFilters(l.rules, label.rules) ||
      l.name.trim().toLowerCase() === label.name.trim().toLowerCase()
  )
    ? current
    : [...current, { ...label, id: generateUUID(), color: nextSplitColor(current) }];

// Whether a once-only automatic split was made already; marks it made.
const firstTime = (key: string): boolean | null => {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
    return true;
  } catch {
    return null;
  }
};

// While a tab is dragged: the window-drag strips (the titlebar, and the
// strip right above the tabs) stop being drag regions (global.css). Over one,
// Electron took the mouse for moving the window, so the release never reached
// the tab and it kept following the pointer.
const setTabDragging = (on: boolean) => {
  if (on) document.body.dataset.tabDragging = 'true';
  else delete document.body.dataset.tabDragging;
};

interface SortableTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  name: string;
  /** Unread conversations under this tab, "N+" while more are still to load; none for 0. */
  count?: number;
  /** A split's colour: the dot before the name and the underline. */
  color?: SplitColor;
  moreToLoad?: boolean;
  active: boolean;
  underline: React.ReactNode;
  onPick: () => void;
  onEdit?: () => void;
  ignoreClick: () => boolean;
}

/**
 * A filter tab that can be dragged to any place in the row.
 * Forwards its ref and other props: it sits inside ContextMenuTrigger asChild.
 */
const SortableTab = React.forwardRef<HTMLButtonElement, SortableTabProps>(
  (
    {
      id,
      name,
      count,
      color,
      moreToLoad,
      className,
      active,
      underline,
      onPick,
      onEdit,
      ignoreClick,
      ...rest
    },
    ref
  ) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id
    });
    const setRefs = (node: HTMLButtonElement | null) => {
      setNodeRef(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };
    return (
      <button
        {...rest}
        ref={setRefs}
        type="button"
        {...attributes}
        {...listeners}
        // dnd-kit describes it as a draggable; it's a tab you click, so keep
        // it a plain toggle button for screen readers.
        role={undefined}
        aria-roledescription={undefined}
        aria-describedby={undefined}
        tabIndex={0}
        aria-pressed={active}
        onClick={() => {
          // The click that ends a drag doesn't pick the tab.
          if (!ignoreClick()) onPick();
        }}
        onDoubleClick={onEdit}
        style={{
          transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined,
          transition
        }}
        className={cn(
          className,
          // Lifted: a solid, softly tinted chip over the row (it was
          // see-through, and the tabs under it showed through). No outline.
          isDragging && 'z-10 cursor-grabbing bg-muted'
        )}
      >
        <span className="flex items-baseline gap-1.5 px-1.5">
          {color && (
            <span
              aria-hidden
              className={cn('h-2 w-2 shrink-0 self-center rounded-full', SPLIT_COLOR_BG[color])}
            />
          )}
          {name}
          {!!count && (
            <>
              <span
                aria-hidden
                className={cn(
                  'text-xs tabular-nums',
                  active ? 'text-foreground/60' : 'text-muted-foreground/70'
                )}
              >
                {count > 999 ? '999+' : moreToLoad ? `${count}+` : count}
              </span>
              {/* Read with the name: "Others, 23 unread". */}
              <span className="sr-only">
                {`, ${t(
                  moreToLoad ? 'filter.custom.unread_count_more' : 'filter.custom.unread_count',
                  {
                    count,
                    defaultValue: moreToLoad ? 'at least {{count}} unread' : '{{count}} unread'
                  }
                )}`}
              </span>
            </>
          )}
        </span>
        {active &&
          (color ? (
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3.5 bottom-1 h-0.5 rounded-full',
                SPLIT_COLOR_BG[color]
              )}
            />
          ) : (
            underline
          ))}
      </button>
    );
  }
);
SortableTab.displayName = 'SortableTab';

type BuiltInTabId = (typeof BUILT_IN_TAB_IDS)[number];

const InboxFilterTabs = React.memo(() => {
  const { t } = useTranslation();
  const { activeFilters, setActiveFilters, getLabelIdsByName, inInbox } = useThreadFilter();
  const { setSelectedThreads, threadIds, threadsMap } = useThreadAtom();
  const { globalSearchQuery } = useGlobalAtom();
  const [customLabels, setCustomLabels] = useAtom(customLabelsAtom);
  const setEditor = useSetAtom(customLabelEditorAtom);
  const [savedOrder, setSavedOrder] = useAtom(filterTabOrderAtom);

  useEffect(() => {
    let added: boolean;
    let split: boolean;
    // Once per install, so deleting it (or turning the split off) sticks.
    try {
      added = !!localStorage.getItem(OTHERS_ADDED_KEY);
      split = !!localStorage.getItem(OTHERS_SPLIT_KEY);
      localStorage.setItem(OTHERS_ADDED_KEY, '1');
      localStorage.setItem(OTHERS_SPLIT_KEY, '1');
    } catch {
      return;
    }
    if (added && !split) {
      setCustomLabels((current) =>
        current.map((l) =>
          sameFilters(l.rules, OTHERS_RULES) && !l.hideFromInbox ? { ...l, hideFromInbox: true } : l
        )
      );
    }
    if (added) return;
    setCustomLabels((current) =>
      current.some(
        (l) => sameFilters(l.rules, OTHERS_RULES) || l.name.trim().toLowerCase() === 'others'
      )
        ? current
        : [
            ...current,
            {
              id: generateUUID(),
              name: t('filter.custom.others_name', 'Others'),
              rules: OTHERS_RULES,
              hideFromInbox: true
            }
          ]
    );
  }, []);

  // Labels made before splits had colours get one each (kept from then on).
  useEffect(() => {
    setCustomLabels((current) => withSplitColors(current));
  }, [setCustomLabels]);

  // Calendar: invitations get their own split.
  useEffect(() => {
    if (!firstTime(CALENDAR_ADDED_KEY)) return;
    setCustomLabels((current) =>
      addLabelOnce(current, {
        name: t('filter.custom.calendar_name', 'Calendar'),
        rules: CALENDAR_RULES,
        hideFromInbox: true
      })
    );
  }, []);

  // Team: mail from your own organisation's domain(s), once the accounts are
  // known. Personal addresses (gmail.com, outlook.com…) have no team, so
  // nothing is made until a work account is connected.
  const { accounts } = useAuth();
  const teamDomains = useMemo(() => teamDomainsFor(accounts.map((a) => a.email ?? '')), [accounts]);
  useEffect(() => {
    if (teamDomains.length === 0 || !firstTime(TEAM_ADDED_KEY)) return;
    setCustomLabels((current) =>
      addLabelOnce(current, {
        name: t('filter.custom.team_name', 'Team'),
        rules: teamDomains.map((domain) => ({ type: 'team', operator: 'is', value: domain })),
        hideFromInbox: true
      })
    );
  }, [teamDomains]);

  // A quick filter belongs to the view it was picked in: switching to another
  // view (Inbox → Sent, a search…) starts unfiltered. Only a real query change
  // resets — not the first mount or a refresh of the same view.
  const previousQueryRef = useRef(globalSearchQuery);
  useEffect(() => {
    if (previousQueryRef.current === globalSearchQuery) return;
    previousQueryRef.current = globalSearchQuery;
    if (activeFilters.length > 0) setActiveFilters([]);
  }, [globalSearchQuery]);

  // Mode resolution — the tab that should appear "active" is derived
  // entirely from the activeFilters atom so external mutations (from the
  // dropdown menu, or programmatic searches) move the underline.
  const mode = (() => {
    const builtIn = BUILT_IN_TAB_IDS.find((id) =>
      sameFilters(activeFilters, BUILT_IN_TAB_RULES[id])
    );
    if (builtIn) return builtIn;
    // One of the custom labels, or a filter set from the dropdown (no tab).
    const label = customLabels.find((l) => sameFilters(activeFilters, l.rules));
    return label ? `label:${label.id}` : 'custom';
  })();

  const builtInNames: Record<BuiltInTabId, string> = {
    all: t('filter.all', { defaultValue: 'All' }),
    unread: t('filter.unread', { defaultValue: 'Unread' }),
    attachments: t('filter.with_attachments', { defaultValue: 'With attachments' })
  };
  const labelsById = new Map(customLabels.map((l) => [l.id, l]));
  // Every tab, in the order the user dragged them into.
  const tabIds = useMemo(
    () => orderTabIds(savedOrder, [...BUILT_IN_TAB_IDS, ...customLabels.map((l) => l.id)]),
    [savedOrder, customLabels]
  );

  // How many unread conversations each tab holds (as in Superhuman's split
  // inbox), split labels' mail left out of the others as the list itself
  // does. Only the list as loaded is counted, so the number reads "N+" while
  // older mail is still to load.
  const { hasMore } = useThreadList();
  const countByTab = useMemo(() => {
    const threads = threadIds.map((id) => threadsMap[id]).filter(Boolean);
    const counts: Record<string, number> = {};
    const count = (tabId: string, rules: FilterCriteria[]) => {
      counts[tabId] = unreadCountForTab(
        threads,
        rules,
        splitLabelsFor(rules, customLabels, inInbox, tabIds),
        getLabelIdsByName
      );
    };
    for (const id of BUILT_IN_TAB_IDS) count(id, BUILT_IN_TAB_RULES[id]);
    for (const label of customLabels) count(label.id, label.rules);
    return counts;
  }, [threadIds, threadsMap, customLabels, inInbox, getLabelIdsByName, tabIds]);

  const onPick = (id: BuiltInTabId) => {
    if (id === mode) return;
    // Rows hidden by the new filter must not stay selected (bulk actions
    // would hit mail you can't see).
    setSelectedThreads([]);
    setActiveFilters(BUILT_IN_TAB_RULES[id]);
  };

  const pickLabel = (label: CustomLabel) => {
    if (mode === `label:${label.id}`) return;
    setSelectedThreads([]);
    setActiveFilters(label.rules);
  };

  // Tab / Shift+Tab on the list: the next / previous tab, wrapping round
  // (keyboard navigation asks through lib/splitCycle). From a filter that
  // isn't a tab, Tab goes to the first tab and Shift+Tab to the last.
  const cycleRef = useRef<(step: 1 | -1) => boolean>(() => false);
  cycleRef.current = (step) => {
    if (!inInbox || tabIds.length < 2) return false;
    const current = tabIds.indexOf(mode.startsWith('label:') ? mode.slice(6) : mode);
    const next =
      current < 0
        ? step === 1
          ? 0
          : tabIds.length - 1
        : (current + step + tabIds.length) % tabIds.length;
    const id = tabIds[next];
    const label = labelsById.get(id);
    if (label) pickLabel(label);
    else onPick(id as BuiltInTabId);
    return true;
  };
  useEffect(() => setSplitCycler((step) => cycleRef.current(step)), []);

  // A small move before a drag starts, so a plain click still picks the tab.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }));
  const dragEndedAtRef = useRef(0);
  const ignoreClick = () => Date.now() - dragEndedAtRef.current < 300;

  // The row the tabs scroll in. A dragged tab moves sideways only and stays
  // inside it; auto-scroll near its ends scrolls this row and nothing else
  // (it also scrolled the thread list, which loaded more mail as it went).
  const rowRef = useRef<HTMLDivElement>(null);
  const rowRectRef = useRef<{ left: number; right: number } | null>(null);
  const keepInRow: Modifier = ({ transform, draggingNodeRect }) => {
    const row = rowRectRef.current;
    if (!row || !draggingNodeRect) return { ...transform, y: 0 };
    return { ...transform, x: clampTabDragX(transform.x, draggingNodeRect, row), y: 0 };
  };
  const autoScroll = useMemo(
    () => ({
      threshold: { x: 0.15, y: 0 },
      canScroll: (element: Element) => element === rowRef.current
    }),
    []
  );
  const startDrag = () => {
    dragEndedAtRef.current = Date.now();
    const rect = rowRef.current?.getBoundingClientRect();
    rowRectRef.current = rect ? { left: rect.left, right: rect.right } : null;
    setTabDragging(true);
  };
  const endDrag = () => {
    dragEndedAtRef.current = Date.now();
    rowRectRef.current = null;
    setTabDragging(false);
  };
  // Leaving the Inbox mid-drag mustn't leave the window undraggable.
  useEffect(() => () => setTabDragging(false), []);

  const moveTab = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= tabIds.length) return;
    setSavedOrder(moveTabId(savedOrder, tabIds, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over || active.id === over.id) return;
    moveTab(tabIds.indexOf(String(active.id)), tabIds.indexOf(String(over.id)));
  };

  const deleteLabel = (label: CustomLabel) => {
    const index = customLabels.findIndex((l) => l.id === label.id);
    if (index < 0) return;
    const wasShowing = mode === `label:${label.id}`;
    setCustomLabels(customLabels.filter((l) => l.id !== label.id));
    if (wasShowing) setActiveFilters([]);
    toast(t('filter.custom.deleted', { name: label.name, defaultValue: 'Deleted "{{name}}"' }), {
      action: {
        label: t('common.undo', 'Undo'),
        onClick: () =>
          // Back in its place: the saved tab order keeps its id (moveTabId).
          setCustomLabels((current) =>
            current.some((l) => l.id === label.id)
              ? current
              : [...current.slice(0, index), label, ...current.slice(index)]
          )
      }
    });
  };

  const tabClass = (active: boolean) =>
    cn(
      // No focus box: Chromium drew its square outline round a tab after a
      // click or a drop. From the keyboard, a soft tint shows where focus is.
      'relative shrink-0 whitespace-nowrap rounded-md px-2 py-2.5 font-medium tracking-tight outline-none transition-colors focus-visible:bg-foreground/[0.06]',
      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    );
  const underline = (
    <span aria-hidden className="absolute inset-x-3.5 bottom-1 h-0.5 rounded-full bg-foreground" />
  );

  return (
    <nav
      aria-label={t('filter.inbox_filters')}
      // The row keeps its height without the tabs, so the list doesn't jump.
      className="no-drag flex min-h-10 items-center gap-1 px-[10%] text-sm"
    >
      {/* The splits are the Inbox's: Starred, Sent, labels and searches show
          their mail without them (Refresh and the filter menu stay). */}
      {inInbox && (
        <>
          {/* The tabs scroll sideways when there are more labels than room. */}
          <div
            ref={rowRef}
            className="flex min-w-0 select-none items-center gap-1 overflow-x-auto [scrollbar-width:none]"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[keepInRow]}
              autoScroll={autoScroll}
              // Focus stays where it was after a drop: putting it back on the tab
              // lit the browser's focus box round it.
              accessibility={{ restoreFocus: false }}
              onDragStart={startDrag}
              onDragEnd={onDragEnd}
              onDragCancel={endDrag}
            >
              <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
                {tabIds.map((id, index) => {
                  const label = labelsById.get(id);
                  const builtIn = label ? undefined : (id as BuiltInTabId);
                  const active = label ? mode === `label:${label.id}` : mode === id;
                  return (
                    <ContextMenu key={id}>
                      <ContextMenuTrigger asChild>
                        <SortableTab
                          id={id}
                          name={label ? label.name : builtInNames[builtIn!]}
                          count={countByTab[id]}
                          color={label?.color}
                          moreToLoad={hasMore}
                          className={tabClass(active)}
                          active={active}
                          underline={underline}
                          onPick={() => (label ? pickLabel(label) : onPick(builtIn!))}
                          onEdit={label ? () => setEditor({ open: true, label }) : undefined}
                          ignoreClick={ignoreClick}
                        />
                      </ContextMenuTrigger>
                      <ContextMenuContent className="dark w-44">
                        {label && (
                          <ContextMenuItem onSelect={() => setEditor({ open: true, label })}>
                            <MonoIcon type="Edit" size={14} className="mr-2" />
                            {t('filter.custom.edit', 'Edit label…')}
                          </ContextMenuItem>
                        )}
                        {/* The same as dragging, for the keyboard. */}
                        <ContextMenuItem
                          disabled={index === 0}
                          onSelect={() => moveTab(index, index - 1)}
                        >
                          <MonoIcon type="ArrowLeft" size={14} className="mr-2" />
                          {t('filter.custom.move_left', 'Move left')}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={index === tabIds.length - 1}
                          onSelect={() => moveTab(index, index + 1)}
                        >
                          <MonoIcon type="ArrowRight" size={14} className="mr-2" />
                          {t('filter.custom.move_right', 'Move right')}
                        </ContextMenuItem>
                        {label && (
                          <ContextMenuItem onSelect={() => deleteLabel(label)}>
                            <MonoIcon type="Trash" size={14} className="mr-2" />
                            {t('filter.custom.delete', 'Delete label')}
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
          <Button
            variant="ghost"
            sizeVariant="sm"
            tooltip={t('filter.custom.new_tooltip', 'New label')}
            aria-label={t('filter.custom.new_tooltip', 'New label')}
            className="h-7 w-7 shrink-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
            onClick={() => setEditor({ open: true })}
          >
            <MonoIcon type="Plus" size={14} />
          </Button>
        </>
      )}
      {/* Refresh and advanced filters live at the end of the row, so they stay
          put while the list scrolls and remain reachable when nothing matches. */}
      <div className="ml-auto flex shrink-0 items-center gap-1 pr-3">
        <RefreshMailButton />
        <FilterOptionDropdownMenu />
      </div>
      <CustomLabelDialog />
    </nav>
  );
});

InboxFilterTabs.displayName = 'InboxFilterTabs';
export default InboxFilterTabs;
