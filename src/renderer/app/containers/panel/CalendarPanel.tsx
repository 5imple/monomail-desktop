import calendarApi from '@/main/api/calendar/calendarApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Calendar } from '@/renderer/app/components/ui/calendar';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/renderer/app/components/ui/tabs';
import { TooltipProvider } from '@/renderer/app/components/ui/tooltip';
import CalendarEventEditor from '@/renderer/app/containers/panel/calendar/CalendarEventEditor';
import type { CalendarEvent } from '@/renderer/app/store/calendar/calendarAtoms';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import type {
  CalendarEventID,
  CalendarViewMode
} from '@/renderer/app/store/calendar/calendarAtoms';
import { useCalendar } from '@/renderer/app/store/calendar/useCalendar';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isSameYear,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths
} from 'date-fns';
import { formatTimeRange, parseEventDate } from '@/renderer/app/containers/panel/calendar/utils';
import { getAccountColor } from '@/renderer/app/containers/panel/calendar/shared';
import {
  getTimezoneAbbreviation,
  getTimezoneLongName
} from '@/renderer/app/containers/panel/calendar/timezoneUtils';
import { calendarDisplayPanelAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import type { UserPreference } from '@/main/api/auth/types';
import { useAtomValue } from 'jotai';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Instance } from 'tippy.js';
import tippy from 'tippy.js';
import DayView from './calendar/DayView';
import { CalendarDragSelection } from '@/renderer/app/store/calendar/calendarAtoms';

type PopoverMode = 'create' | 'edit';

interface CalendarPanelProps {
  className?: string;
}

// Agenda list for a specific date. Rows are buttons (they were bare <li>s:
// no hover, no focus, nothing saying they open the event).
const AgendaList: React.FC<{
  date: Date;
  events: CalendarEvent[];
  activeEventId: string | null;
  preference?: UserPreference;
  onEventClick: (event: CalendarEvent, anchorEl: HTMLElement) => void;
  onNewEvent: (anchorEl: HTMLElement) => void;
}> = ({ date, events, activeEventId, preference, onEventClick, onNewEvent }) => {
  return (
    <ScrollArea className="h-full w-full">
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <div className="text-sm text-muted-foreground">
            No events on {format(date, 'EEE, MMM d')}
          </div>
          <Button variant="secondary" sizeVariant="sm" onClick={(e) => onNewEvent(e.currentTarget)}>
            <MonoIcon type="Plus" className="mr-1 h-3.5 w-3.5" />
            New event
          </Button>
        </div>
      ) : (
        <ul className="space-y-0.5 p-1.5">
          {events.map((evt) => (
            <li key={evt.id}>
              <button
                className={cn(
                  'flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeEventId === evt.id && 'bg-muted'
                )}
                onClick={(e) => onEventClick(evt, e.currentTarget)}
              >
                <span
                  className="w-[3px] shrink-0 self-stretch rounded-full"
                  style={{ backgroundColor: getAccountColor(preference, evt.accountUid) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {evt.title || <span className="text-muted-foreground">(No title)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {/* All-day start/end are both local midnight, which rendered
                        as "12:00 AM – 12:00 AM". */}
                    {evt.allDay
                      ? 'All-day'
                      : formatTimeRange(
                          parseEventDate(evt.start.dateTime) || new Date(),
                          parseEventDate(evt.end.dateTime) || new Date()
                        )}
                  </span>
                  {evt.location && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {evt.location}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  );
};

const CalendarPanel: React.FC<CalendarPanelProps> = ({ className }) => {
  const { t } = useTranslation();
  // ============================================================================
  // CLEAN CALENDAR HOOK
  // ============================================================================
  const {
    // Core state
    today,
    setToday,
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    viewMode,
    setViewMode,
    selectedAccountUids,
    setSelectedAccountUids,
    selectedTimeZone,
    setSelectedTimeZone,

    // Event operations
    getEvent,
    dayEvents,

    loadGoogleEvents,
    updateEventFields,
    activeEventId,
    getActiveEvent,
    setActiveEvent,

    getEventStatus,
    hasAttendees,

    // Utilities
    clearAccountEvents,
    getMonthCacheKey,
    getPreloadMonths
  } = useCalendar();
  // ============================================================================
  // LEGACY COMPATIBILITY
  // ============================================================================

  // Time zone used for formatting reference
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Abort controllers per month
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const { activeSpace } = useSpaceAtom();
  const { accounts, preference } = useAuth();

  // Update selected accounts when accounts change
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountUids.length === 0) {
      setSelectedAccountUids(accounts.map((acc) => acc.uid));
    }
  }, [accounts, selectedAccountUids.length, setSelectedAccountUids]);

  // Note: dayEvents automatically updates when drafts or timezone changes
  // through the reactive dayEventsAtom - no need to refetch from API

  const activeUid = activeSpace?.activeAccountUids?.[0] || accounts[0]?.uid || null;
  const prevSelectedUidsRef = useRef<string[]>([]);

  // ============================================================================
  // MONTH LOADING LOGIC
  // ============================================================================

  // Accounts whose last load failed, and how many loads are running. A failed
  // load (no calendar consent, an expired token) looked exactly like an empty
  // day; now it's named in a banner above the grid, with Retry.
  const [loadErrors, setLoadErrors] = useState<Record<string, true>>({});
  const [loadsInFlight, setLoadsInFlight] = useState(0);

  // Resolves false when the load failed (aborts don't count), so Refresh can
  // report the failure instead of always saying "refreshed successfully".
  const fetchMonth = async (m: Date, uid: string | null): Promise<boolean> => {
    if (!uid) return true;
    const key = getMonthCacheKey(m, uid);

    // Simple check - in clean architecture, we'll track loaded months differently
    // For now, we'll always fetch to ensure data freshness

    // Abort any in-flight fetch for this key to avoid race conditions
    try {
      abortControllersRef.current[key]?.abort();
    } catch {
      // ignore
    }
    const controller = new AbortController();
    abortControllersRef.current[key] = controller;

    setLoadsInFlight((n) => n + 1);
    try {
      const load = () =>
        calendarApi.getGoogleCalendarEvents(
          {
            calendarId: 'primary',
            timeMin: startOfMonth(m).toISOString(),
            timeMax: endOfMonth(m).toISOString(),
            uid
          },
          controller.signal
        );
      // The API client shares identical in-flight requests, so this load can
      // join one whose starter then cancels it (reloading a month aborts the
      // earlier load of it). That isn't this load failing: run it on its own.
      const data = await load().catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          (error as { name?: string } | null)?.name === 'AbortError'
        ) {
          return load();
        }
        throw error;
      });

      // Load events into clean state. Only a complete listing (no further
      // page) may prune events the server no longer returns.
      loadGoogleEvents(
        data.items,
        uid,
        data.nextPageToken ? undefined : { timeMin: startOfMonth(m), timeMax: endOfMonth(m) }
      );
      setLoadErrors((prev) => {
        if (!prev[uid]) return prev;
        const next = { ...prev };
        delete next[uid];
        return next;
      });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return true;
      console.error('Failed to load calendar month:', error);
      setLoadErrors((prev) => (prev[uid] ? prev : { ...prev, [uid]: true }));
      return false;
    } finally {
      setLoadsInFlight((n) => Math.max(0, n - 1));
    }
  };

  useEffect(() => {
    if (selectedAccountUids.length === 0) return;

    // If selected accounts changed, abort previous requests and clear cache for removed accounts
    const prevUids = prevSelectedUidsRef.current;
    const uidsChanged =
      JSON.stringify([...selectedAccountUids].sort()) !== JSON.stringify([...prevUids].sort());

    if (uidsChanged) {
      // Clear events for accounts that are no longer selected
      const removedUids = prevUids.filter((uid) => !selectedAccountUids.includes(uid));
      if (removedUids.length > 0) {
        clearAccountEvents(removedUids);

        // Abort controllers for removed accounts
        Object.keys(abortControllersRef.current).forEach((key) => {
          const [uid] = key.split(':');
          if (removedUids.includes(uid)) {
            abortControllersRef.current[key]?.abort();
            delete abortControllersRef.current[key];
          }
        });
      }

      prevSelectedUidsRef.current = [...selectedAccountUids];
    }

    // Preload prev, current, next months for all selected accounts
    const monthsToFetch = getPreloadMonths(currentMonth);

    selectedAccountUids.forEach((uid) => {
      monthsToFetch.forEach((m) => fetchMonth(m, uid));
    });

    // cleanup outdated controllers
    const validKeys = new Set(
      selectedAccountUids.flatMap((uid) => monthsToFetch.map((m) => getMonthCacheKey(m, uid)))
    );

    Object.keys(abortControllersRef.current).forEach((k) => {
      if (!validKeys.has(k)) {
        abortControllersRef.current[k]?.abort();
        delete abortControllersRef.current[k];
      }
    });
  }, [
    currentMonth,
    selectedAccountUids,
    clearAccountEvents,
    getMonthCacheKey,
    getPreloadMonths,
    loadGoogleEvents
  ]);

  // Defensive: when accounts first become available, trigger an initial fetch
  // even if the dep-based effect above had a race where selectedAccountUids was
  // briefly []. The ref guard makes this run exactly once per mount, as soon as
  // accounts is non-empty — `currentMonth` and `fetchMonth` are intentionally
  // captured at that first run (NOT deps), so later month navigation doesn't
  // re-trigger this; the main effect above owns ongoing fetches.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    if (accounts.length === 0) return;
    initialFetchedRef.current = true;
    const uids = accounts.map((a) => a.uid);
    const monthsToFetch = getPreloadMonths(currentMonth);
    uids.forEach((uid) => monthsToFetch.forEach((m) => fetchMonth(m, uid)));
  }, [accounts, getPreloadMonths]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  // todayAtom is set once at launch and the panel stays mounted for days, so
  // roll it over when the date changes; Today must jump to the real today.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (!isSameDay(now, today)) setToday(now);
    }, 60_000);
    return () => clearInterval(timer);
  }, [today, setToday]);

  // Today also scrolls the day grid back to now, even when today was already
  // showing (it only changed dates, so nothing visibly happened).
  const [scrollToNowNonce, setScrollToNowNonce] = useState(0);
  const goToday = () => {
    const now = new Date();
    setToday(now);
    setSelectedDate(now);
    setCurrentMonth(now);
    setScrollToNowNonce((n) => n + 1);
  };

  const goPrevMonth = () => setCurrentMonth((d) => subMonths(d, 1));
  const goNextMonth = () => setCurrentMonth((d) => addMonths(d, 1));

  // One day back or forward; the mini calendar (and its month loads) follow
  // when that crosses into another month.
  const stepDay = (direction: 1 | -1) => {
    const next = direction === 1 ? addDays(selectedDate, 1) : subDays(selectedDate, 1);
    setSelectedDate(next);
    if (!isSameMonth(next, currentMonth)) setCurrentMonth(next);
  };

  // Close editor when date changes
  useEffect(() => {
    if (activePopoverRef.current) {
      activePopoverRef.current.hide();
    }
  }, [selectedDate]);

  // The panel stays mounted while hidden, so its editor kept floating over
  // the mail after the calendar was toggled off.
  const calendarDisplayPanel = useAtomValue(calendarDisplayPanelAtom);
  useEffect(() => {
    if (!calendarDisplayPanel) activePopoverRef.current?.hide();
  }, [calendarDisplayPanel]);

  // ============================================================================
  // POPOVER MANAGEMENT
  // ============================================================================

  const activePopoverRef = useRef<Instance | null>(null);

  // Helper function to find the scroll area viewport containing the anchor element
  const findScrollAreaViewport = (element: HTMLElement | null): HTMLElement | null => {
    if (!element) return null;

    let current = element.parentElement;
    while (current) {
      // Look for the Radix ScrollArea.Viewport data attribute
      if (current.hasAttribute('data-radix-scroll-area-viewport')) {
        return current;
      }

      // Check if this element has scroll capabilities
      const styles = window.getComputedStyle(current);
      if (
        styles.overflow === 'auto' ||
        styles.overflow === 'scroll' ||
        styles.overflowY === 'auto' ||
        styles.overflowY === 'scroll'
      ) {
        // Verify it actually has scrollable content
        if (current.scrollHeight > current.clientHeight) {
          return current;
        }
      }

      current = current.parentElement;
    }
    return null;
  };

  const openEventPopover = (
    anchor: {
      el?: HTMLElement;
      point?: { clientX: number; clientY: number };
      rect?: { left: number; top: number; width: number; height: number };
    },
    mode: PopoverMode,
    defaults: {
      title?: string;
      start: Date;
      end: Date;
      location?: string;
      description?: string;
      allDay?: boolean;
    },
    eventId?: CalendarEventID,
    onCloseComplete?: () => void
  ) => {
    const container = document.createElement('div');
    // An open dialog to the rest of the app, so its Escape (close the email)
    // and Enter (Reply All) step aside while the editor is up. no-drag keeps
    // it clickable if it's pushed under the titlebar drag strip.
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', mode === 'create' ? 'New event' : 'Edit event');
    container.setAttribute('data-state', 'open');
    container.setAttribute('data-calendar-editor', 'true');
    container.classList.add('no-drag');
    // Tippy's reference. It was document.body, which made every press "inside
    // the reference", so clicking outside the editor never closed it.
    const referenceEl = document.createElement('div');
    referenceEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none';
    document.body.appendChild(referenceEl);
    // Where focus goes back to when the editor closes from the keyboard or its
    // own buttons (an outside click leaves focus where it landed).
    const returnFocusEl = document.activeElement as HTMLElement | null;
    let restoreFocus = false;
    let scrollViewport: HTMLElement | null = null;

    // Find the scroll area viewport for the anchor element
    if (anchor.el) {
      scrollViewport = findScrollAreaViewport(anchor.el);
    }

    const root = createRoot(container);
    let instance: Instance | null = null;
    let rafId: number | null = null;

    // Keys typed in the editor stay in it: a plain E, U, S, Z or Backspace on
    // a focused button or switch reached the inbox hotkeys and acted on the
    // email open in the reader. Added after createRoot, so React's handlers on
    // this node run first; ⌘/Ctrl shortcuts pass through.
    container.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.stopPropagation();
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // With attendee suggestions showing, Escape closes those first.
      const suggestions = (e.target as HTMLElement | null)
        ?.closest?.('[cmdk-root]')
        ?.querySelector<HTMLElement>('[cmdk-list]');
      if (suggestions && suggestions.offsetParent !== null) return;
      restoreFocus = true;
      instance?.hide();
    });

    let finalized = false;
    const finalize = (closingInst?: Instance | null) => {
      if (finalized) return;
      finalized = true;
      if (rafId !== null) {
        try {
          cancelAnimationFrame(rafId);
        } catch {
          // ignore
        }
        rafId = null;
      }
      // A newer editor can open before this one finishes hiding. It owns the
      // ref and the selection then: clearing the active event here unselected
      // the event that was just clicked.
      const replaced =
        !!closingInst && !!activePopoverRef.current && activePopoverRef.current !== closingInst;
      if (!replaced) {
        activePopoverRef.current = null;
      }
      root.unmount();
      referenceEl.remove();
      // Clear the active selection when the editor closes
      if (!replaced) {
        try {
          setActiveEvent(null);
        } catch {
          // ignore
        }
      }
      const focused = document.activeElement;
      if (
        restoreFocus &&
        returnFocusEl &&
        returnFocusEl !== document.body &&
        returnFocusEl.isConnected &&
        (!focused || focused === document.body)
      ) {
        returnFocusEl.focus({ preventScroll: true });
      }
      try {
        if (typeof onCloseComplete === 'function') onCloseComplete();
      } catch {
        // noop
      }
    };

    const destroy = () => {
      restoreFocus = true;
      try {
        instance?.destroy?.();
      } finally {
        finalize(instance);
      }
    };

    // The editor renders in its own root, outside the app's providers: its
    // attendee status icons use tooltips, and without a TooltipProvider here
    // every event with attendees opened blank.
    const renderEditor = () =>
      root.render(
        <TooltipProvider delayDuration={300}>
          <CalendarEventEditor
            mode={mode}
            accounts={accounts}
            eventId={eventId}
            defaultValues={defaults}
            preference={preference}
            onClose={destroy}
            onEventCreated={(createdEventId) => {
              // Update active event to the newly created one
              const createdEvent = getEvent(createdEventId);
              if (createdEvent) {
                setActiveEvent(createdEvent);
              }
              // (No toast here: the editor already confirms, so it showed twice.)

              // Refresh events for the target month, in the event's own account
              const uid = createdEvent?.accountUid ?? activeUid;
              if (uid) {
                const targetMonth = defaults?.start ? new Date(defaults.start) : new Date();
                fetchMonth(targetMonth, uid);
              }
            }}
            onEventUpdated={(updatedEventId) => {
              // Refresh events when an event is updated
              const uid = getEvent(updatedEventId)?.accountUid ?? activeUid;
              if (uid) {
                const targetMonth = defaults?.start ? new Date(defaults.start) : new Date();
                fetchMonth(targetMonth, uid);
              }
            }}
            onEventDeleted={(deletedEventId) => {
              // Clear active event if it was deleted
              const activeEvent = getActiveEvent();
              if (activeEvent?.id === deletedEventId) {
                setActiveEvent(null);
              }
            }}
            initialAccountUid={mode === 'create' ? activeUid || undefined : undefined}
          />
        </TooltipProvider>
      );

    renderEditor();

    // Capture an initial rect and then stick to the last known rect to avoid flicker to (0,0)
    const computeInitialRect = (): DOMRect => {
      try {
        if (anchor.el) {
          try {
            const rect = anchor.el.getBoundingClientRect();
            if (anchor.el.isConnected && (rect.width !== 0 || rect.height !== 0)) {
              return rect;
            }
          } catch {
            // ignore and try re-query below
          }
          // If the original element is gone or has zero size, try to re-query by event id
          try {
            if (eventId) {
              const fresh = document.querySelector(
                `[data-event-id="${eventId}"]`
              ) as HTMLElement | null;
              if (fresh) {
                anchor.el = fresh;
                const rect = fresh.getBoundingClientRect();
                if (rect) return rect as DOMRect;
              }
            }
          } catch {
            // ignore
          }
        }
        if (anchor.point) {
          const { clientX, clientY } = anchor.point;
          return new DOMRect(clientX, clientY, 0, 0);
        }
        if (anchor.rect) {
          const { left, top, width, height } = anchor.rect;
          return new DOMRect(left, top, width, height);
        }
      } catch {
        // ignore
      }
      return new DOMRect(0, 0, 0, 0);
    };

    let lastKnownRect: DOMRect = computeInitialRect();
    let shouldHideArrow = false;
    let isDragging = false;
    let dragStableRect: DOMRect | null = null;

    const getReferenceClientRect = () => {
      try {
        // Check if element is being dragged
        if (anchor.el) {
          const isCurrentlyDragging = anchor.el.closest('[data-dragging="true"]') !== null;

          // If drag just started, capture stable position
          if (isCurrentlyDragging && !isDragging) {
            isDragging = true;
            dragStableRect = anchor.el.getBoundingClientRect();
          }
          // If drag just ended, clear stable position
          else if (!isCurrentlyDragging && isDragging) {
            isDragging = false;
            dragStableRect = null;
          }
        }

        // During drag, use stable position to prevent flickering
        if (isDragging && dragStableRect) {
          return dragStableRect;
        }

        // 1) Measure anchor rect (element, point, or provided rect)
        let baseRect: DOMRect;
        if (anchor.el) {
          let rect: DOMRect | null = null;
          try {
            rect = anchor.el.getBoundingClientRect();
          } catch {
            rect = null;
          }
          if (
            rect &&
            anchor.el.isConnected &&
            ((rect as DOMRect).width !== 0 || (rect as DOMRect).height !== 0)
          ) {
            baseRect = rect as DOMRect;
            lastKnownRect = rect as DOMRect;
          } else {
            // Attempt to re-query the fresh DOM node for this event id after UI re-render
            try {
              if (eventId) {
                const fresh = document.querySelector(
                  `[data-event-id="${eventId}"]`
                ) as HTMLElement | null;
                if (fresh) {
                  anchor.el = fresh;
                  const freshRect = fresh.getBoundingClientRect();
                  if (freshRect && (freshRect.width !== 0 || freshRect.height !== 0)) {
                    baseRect = freshRect as DOMRect;
                    lastKnownRect = freshRect as DOMRect;
                  } else {
                    baseRect = lastKnownRect;
                  }
                } else {
                  baseRect = lastKnownRect;
                }
              } else {
                baseRect = lastKnownRect;
              }
            } catch {
              baseRect = lastKnownRect;
            }
          }
        } else if (anchor.point) {
          baseRect = lastKnownRect;
        } else if (anchor.rect) {
          const { left, top, width, height } = anchor.rect;
          baseRect = new DOMRect(left, top, width, height);
          lastKnownRect = baseRect;
        } else {
          baseRect = lastKnownRect;
        }

        // 2) Compute the desired anchor point for the tooltip
        // Always anchor to the left edge so popover renders to the left side
        const anchorX = baseRect.left;
        const anchorCenterY = baseRect.top + baseRect.height / 2;

        // 3) Clamp the anchor center Y within the visible viewport of the scroll area
        const explicitViewport = document.getElementById('calendar-day-viewport');
        const viewportEl = explicitViewport || scrollViewport;
        const padding = 6; // small offset from absolute edges
        let clampedCenterY = anchorCenterY;

        // Check if this is an all-day event by looking for the event element
        let isAllDayEvent = false;
        if (anchor.el) {
          try {
            // Check if the element is within the all-day section using data attribute
            const allDaySection = anchor.el.closest('[data-all-day-section="true"]');
            if (allDaySection) {
              isAllDayEvent = true;
            }
          } catch {
            // ignore
          }
        }

        if (viewportEl && !isAllDayEvent) {
          const vr = viewportEl.getBoundingClientRect();
          const minY = vr.top + padding;
          const maxY = vr.bottom - padding;
          const original = clampedCenterY;
          clampedCenterY = Math.min(Math.max(clampedCenterY, minY), maxY);
          shouldHideArrow = Math.abs(clampedCenterY - original) > 2; // hide arrow if adjusted
        } else {
          shouldHideArrow = false;
        }

        // 4) Return a point-sized rect for precise anchoring
        return new DOMRect(anchorX, clampedCenterY, 0, 0);
      } catch {
        // ignore and fallback
      }
      return lastKnownRect;
    };

    try {
      // Hide any existing tippies globally to avoid duplicates, then enforce our single active
      try {
        (tippy as unknown as { hideAll?: (opts?: { duration?: number }) => void }).hideAll?.({
          duration: 0
        });
      } catch {
        // ignore
      }
      // Enforce single active popover
      if (activePopoverRef.current) {
        // Hide instead of destroy so onHidden runs and cleans up mounted React roots safely
        const prev = activePopoverRef.current;
        try {
          prev.hide();
        } catch {
          // ignore
        }
        activePopoverRef.current = null;
      }
      instance = tippy(referenceEl, {
        getReferenceClientRect,
        appendTo: document.body,
        content: container,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        // Keep tippy under Radix portals (which use z-50)
        // This ensures Select/Popover dropdowns render above the editor
        zIndex: 40,
        // Always place to the left of the reference point
        placement: 'left',
        theme: 'mono',
        maxWidth: 'none',
        // Do not auto-hide on click; we manually handle outside clicks to allow
        // interactions with portaled dropdowns/popovers
        hideOnClick: false,
        // Use fixed strategy to avoid scroll-parent offset issues
        popperOptions: { strategy: 'fixed' },
        onClickOutside: (inst, event) => {
          try {
            const target = (event as MouseEvent)?.target as HTMLElement | null;
            // If the click is inside the tippy popper itself, ignore (tippy supplies this)
            if (!target || inst.popper.contains(target)) return;
            // An open Radix Select blocks pointer events on the page, so the
            // press lands on <html>/<body>: it closes the Select, not this.
            if (
              target === document.documentElement ||
              target === document.body ||
              document.body.style.pointerEvents === 'none'
            ) {
              return;
            }
            // The editor's portaled pickers and menus, and event blocks (their
            // own click swaps the editor for theirs).
            const keep = target.closest(
              '[data-calendar-keep-popover="true"], [role="listbox"], [data-radix-popper-content-wrapper], [data-event-id], [data-calendar-pending-event]'
            );
            if (keep) return;
            inst.hide();
          } catch {
            // ignore
          }
        },
        onMount: (inst) => {
          // Continuously update reference rect while visible (scroll/drag)
          let lastUpdateTime = 0;
          const updateInterval = 16; // ~60fps normally, but throttle during drag

          const step = (currentTime: number) => {
            try {
              // Throttle updates during drag operations to prevent flickering
              const shouldThrottle = isDragging;
              const throttleInterval = shouldThrottle ? 100 : updateInterval; // 10fps during drag

              if (currentTime - lastUpdateTime >= throttleInterval) {
                inst.setProps({ getReferenceClientRect });
                // Hide/show arrow based on constraint status
                const arrowElement = inst.popper.querySelector(
                  '[data-popper-arrow]'
                ) as HTMLElement;
                if (arrowElement) {
                  arrowElement.style.display = shouldHideArrow ? 'none' : '';
                }
                // Nudge Popper to recalc immediately
                inst.popperInstance?.update?.();
                lastUpdateTime = currentTime;
              }
            } catch {
              // ignore
            }
            rafId = requestAnimationFrame(step);
          };
          rafId = requestAnimationFrame(step);
        },
        onHidden: (inst) => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          try {
            inst.destroy();
          } catch {
            // ignore
          }
          finalize(inst);
        }
      });
      if (instance) {
        activePopoverRef.current = instance;
        instance.show();
      }
    } catch {
      // eslint-disable-next-line no-console
      destroy();
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleEventClick = (evt: CalendarEvent, anchorEl: HTMLElement) => {
    setActiveEvent(evt);
    openEventPopover(
      { el: anchorEl },
      'edit',
      {
        title: evt.title,
        start: parseEventDate(evt.allDay ? evt.start.date : evt.start.dateTime) || new Date(),
        end: parseEventDate(evt.allDay ? evt.end.date : evt.end.dateTime) || new Date(),
        location: evt.location || '',
        description: evt.description || '',
        allDay: evt.allDay
      },
      evt.id
    );
  };

  // DayView integration props
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragSelection, setDragSelection] = useState<CalendarDragSelection | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{ start: Date; end: Date } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onClearSelection = () => {
    // Hide any active popover first to avoid flicker, then clear selection state
    if (activePopoverRef.current) {
      const inst = activePopoverRef.current;
      try {
        inst.hide();
      } catch {
        // ignore
      }
      // Delay unselect to after hide begins
      setTimeout(() => {
        setActiveEvent(null);
        setIsDragSelecting(false);
        setDragSelection(null);
      }, 0);
    } else {
      setActiveEvent(null);
      setIsDragSelecting(false);
      setDragSelection(null);
    }
  };

  const onCreateEvent = (
    date: Date,
    hour?: number,
    minute?: number,
    anchor?:
      | { clientX: number; clientY: number }
      | { rect: { left: number; top: number; width: number; height: number } },
    endDate?: Date
  ) => {
    // No hour means the all-day row: create an all-day event on that day (it
    // made a timed one at whatever time the selected date carried).
    const allDay = hour === undefined;
    const start = allDay ? startOfDay(date) : new Date(date);
    if (hour !== undefined) start.setHours(hour);
    if (minute !== undefined) start.setMinutes(minute);
    const end = endDate
      ? new Date(endDate)
      : allDay
        ? endOfDay(date)
        : new Date(start.getTime() + 60 * 60 * 1000);
    openEventPopover(
      anchor && 'rect' in anchor
        ? { rect: anchor.rect }
        : anchor && 'clientX' in anchor
          ? { point: anchor }
          : { rect: { left: 300, top: 200, width: 0, height: 0 } },
      'create',
      {
        start,
        end,
        ...(allDay ? { allDay: true } : {})
      }
    );
  };

  // The header's New event: the next half hour on the selected day, for an
  // hour, in the default account. Opens beside the panel's left edge.
  const panelRef = useRef<HTMLDivElement>(null);
  const createNewEvent = (anchorEl: HTMLElement) => {
    const now = new Date();
    const minutes = Math.min(
      Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30,
      23 * 60
    );
    const start = startOfDay(selectedDate);
    start.setMinutes(minutes);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const anchorRect = anchorEl.getBoundingClientRect();
    const panelLeft = panelRef.current?.getBoundingClientRect().left ?? anchorRect.left;
    openEventPopover(
      { rect: { left: panelLeft, top: anchorRect.top, width: 0, height: anchorRect.height } },
      'create',
      { start, end }
    );
  };

  const onDragSelectionStart = (date: Date, hour?: number, minute?: number) => {
    // If a popover is open from a previous temp-create, hide it and clear the temp block
    if (activePopoverRef.current) {
      const inst = activePopoverRef.current;
      // Defer to next tick to avoid unmounting during current render
      setTimeout(() => {
        try {
          inst.hide();
        } catch {
          // ignore
        }
      }, 0);
      activePopoverRef.current = null;
    }
    if (pendingCreate) {
      setPendingCreate(null);
    }
    setIsDragSelecting(true);
    const startDate = new Date(date);
    if (hour !== undefined) startDate.setHours(hour);
    if (minute !== undefined) startDate.setMinutes(minute);
    setDragSelection({
      startDate,
      endDate: startDate,
      startHour: hour,
      startMinute: minute,
      endHour: hour,
      endMinute: minute
    });
  };

  const onDragSelectionChange = (date: Date, hour?: number, minute?: number) => {
    if (!isDragSelecting || !dragSelection) return;
    const endDate = new Date(date);
    if (hour !== undefined) endDate.setHours(hour);
    if (minute !== undefined) endDate.setMinutes(minute);
    setDragSelection({
      ...dragSelection,
      endDate,
      endHour: hour,
      endMinute: minute
    });
  };

  const onDragSelectionEnd = (date: Date, hour?: number, minute?: number) => {
    if (!isDragSelecting || !dragSelection) return;
    const endDate = new Date(date);
    if (hour !== undefined) endDate.setHours(hour);
    if (minute !== undefined) endDate.setMinutes(minute);
    // Ensure start is before end; if user dragged upwards, flip the range
    let start = new Date(dragSelection.startDate);
    let end = endDate;
    if (end.getTime() < start.getTime()) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    // If the selection did not move (simple click), do not create a pending temp event
    if (start.getTime() === end.getTime()) {
      setIsDragSelecting(false);
      setDragSelection(null);
      return;
    }
    // Slots are 15 minutes and the range includes the last one hovered, as
    // the drag overlay shows; it ended at that slot's start, one slot short
    // (and dropped the first slot when dragging upward).
    if (dragSelection.startHour !== undefined) {
      end = new Date(end.getTime() + 15 * 60 * 1000);
    }
    // Defer opening; render a temporary event block and anchor popover to it
    setPendingCreate({ start, end });
    setIsDragSelecting(false);
    setDragSelection(null);
  };

  // A drag-select only ended on a time slot's own mouseup. Releasing over an
  // event, the hour gutter or outside the panel left the selection stuck to
  // the cursor with no button held. End it at the last hovered slot instead.
  const dragSelectionRef = useRef(dragSelection);
  dragSelectionRef.current = dragSelection;
  useEffect(() => {
    if (!isDragSelecting) return;
    const handleWindowMouseUp = (e: MouseEvent) => {
      // Releases over a slot are handled by the slot's own onMouseUp.
      if ((e.target as HTMLElement | null)?.closest?.('[data-slot-date]')) return;
      const selection = dragSelectionRef.current;
      if (selection) onDragSelectionEnd(selection.endDate);
      else setIsDragSelecting(false);
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [isDragSelecting]);

  const handlePendingCreateRendered = (el: HTMLElement, start: Date, end: Date) => {
    // Open create popover anchored to the temporary block and clear it after popover closes
    openEventPopover(
      { el },
      'create',
      {
        start,
        end
      },
      undefined,
      // Only clear the pending temp event if the same range is still pending when this popover closes
      () =>
        setPendingCreate((prev) => {
          if (
            prev &&
            prev.start.getTime() === start.getTime() &&
            prev.end.getTime() === end.getTime()
          ) {
            return null;
          }
          return prev;
        })
    );
  };

  const onEventDragEnd = async (event: CalendarEvent, newStart: Date, newEnd: Date) => {
    const accountsInfo = accounts.map((acc) => ({ uid: acc.uid, email: acc.email }));
    // Use clean architecture's moveEvent method with accounts info
    // Create a local moveEvent wrapper that includes accounts
    const moveEventWithAccounts = (eventId: string, newStart: Date, newEnd: Date) => {
      return updateEventFields(
        eventId,
        {
          start: {
            dateTime: newStart.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          end: {
            dateTime: newEnd.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        },
        'drag',
        accountsInfo
      );
    };

    // Check if event has attendees to determine notification behavior
    const eventHasAttendees = hasAttendees(event.id);
    // What Undo puts back: the times exactly as they were, time zones included.
    const before = { start: { ...event.start }, end: { ...event.end } };

    try {
      await moveEventWithAccounts(event.id, newStart, newEnd);
    } catch (error) {
      // The move was rolled back (smartCreateDraftAtom) — say so instead of
      // claiming success.
      console.error('Failed to move event:', error);
      toast.error(t('calendar.toast.move_error'));
      return;
    }

    if (!eventHasAttendees) {
      // Saved already, so offer Undo rather than popping the editor open.
      toast.success(t('calendar.toast.rescheduled', { range: formatTimeRange(newStart, newEnd) }), {
        action: {
          label: t('toast.undo'),
          onClick: async () => {
            // Only while the event is still where this move left it.
            const current = getEvent(event.id);
            const at = (value: unknown) => parseEventDate(value)?.getTime();
            if (
              !current ||
              at(current.start.dateTime) !== newStart.getTime() ||
              at(current.end.dateTime) !== newEnd.getTime()
            ) {
              toast(t('calendar.toast.move_changed_since'));
              return;
            }
            try {
              await updateEventFields(event.id, before, 'drag', accountsInfo);
            } catch (error) {
              console.error('Failed to undo event move:', error);
              toast.error(t('calendar.toast.undo_move_error'));
            }
          }
        }
      });
      return;
    }

    // A meeting's move is a draft until updates are sent: open the editor
    // near the dragged element so they can be.
    toast.success(t('calendar.toast.moved_send_updates'));
    const eventElement = document.querySelector(`[data-event-id="${event.id}"]`) as HTMLElement;
    if (eventElement) {
      openEventPopover(
        { el: eventElement },
        'edit',
        {
          title: event.title,
          start: newStart,
          end: newEnd,
          location: event.location || '',
          description: event.description || ''
        },
        event.id
      );
    } else {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      openEventPopover(
        { rect: { left: centerX, top: centerY, width: 0, height: 0 } },
        'edit',
        {
          title: event.title,
          start: newStart,
          end: newEnd,
          location: event.location || '',
          description: event.description || ''
        },
        event.id
      );
    }
  };

  // Escape closes the editor while focus is outside it (inside, the editor's
  // own key handler does). An Escape that already closed something, like a
  // select menu or the date picker, is left alone: it closed the editor too.
  // (A Backspace/Delete branch here meant to delete the selected event never
  // could: it read the active event once, at mount.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !activePopoverRef.current) return;
      e.preventDefault();
      try {
        activePopoverRef.current.hide();
      } catch {
        // ignore
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Refresh reloads the month on screen and the selected day's month (they
  // differ after paging the mini calendar). Success needs no toast: the
  // spinning icon is the feedback, and a failure stays named in the banner.
  const refresh = async () => {
    if (isRefreshing) return; // Prevent multiple simultaneous refreshes
    setIsRefreshing(true);
    try {
      const months = isSameMonth(selectedDate, currentMonth)
        ? [currentMonth]
        : [currentMonth, selectedDate];
      const results = await Promise.all(
        selectedAccountUids.flatMap((uid) => months.map((m) => fetchMonth(m, uid)))
      );
      if (results.includes(false)) toast.error(t('calendar.toast.refresh_error'));
    } finally {
      setIsRefreshing(false);
    }
  };
  const loading = isRefreshing || loadsInFlight > 0;
  const failedAccounts = accounts.filter(
    (acc) => loadErrors[acc.uid] && selectedAccountUids.includes(acc.uid)
  );

  const isSelectedToday = isSameDay(selectedDate, new Date());
  const zoneAbbreviation = getTimezoneAbbreviation(userTimeZone, selectedDate);

  return (
    <div ref={panelRef} className={cn('no-drag flex h-full w-full flex-col', className)}>
      {/* Header */}
      <div className="drag flex items-center gap-2 p-2 pb-0">
        <div className="ml-1 line-clamp-1 shrink-0 font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </div>

        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          tooltip={loading ? 'Refreshing…' : 'Refresh'}
          onClick={refresh}
          className="ml-1"
          disabled={isRefreshing}
        >
          <MonoIcon
            type="RotateCcw"
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground',
              // Spins the way its arrow points while anything is loading.
              loading && 'animate-spin [animation-direction:reverse]'
            )}
          />
        </Button>
        {/* Creating used to need a drag on the grid, with nothing hinting at it. */}
        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          tooltip={t('calendar.new_event')}
          onClick={(e) => createNewEvent(e.currentTarget)}
          className="-ml-1"
        >
          <MonoIcon type="Plus" className="h-4 w-4 text-muted-foreground" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {/* <AccountSelector
            accounts={accounts}
            selectedAccountUids={selectedAccountUids}
            onSelectionChange={setSelectedAccountUids}
            preference={preference}
          /> */}
          <Button
            variant="secondary"
            sizeVariant="sm"
            typeVariant="icon"
            tooltip={t('calendar.previous_month')}
            onClick={goPrevMonth}
          >
            <MonoIcon type="ChevronLeft" />
          </Button>
          <Button
            variant="secondary"
            sizeVariant="sm"
            typeVariant="icon"
            tooltip={t('calendar.next_month')}
            onClick={goNextMonth}
          >
            <MonoIcon type="ChevronRight" />
          </Button>
          <Button variant="secondary" sizeVariant="sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Date picker */}
      <Calendar
        mode="single"
        captionLayout="label"
        className="w-full border-b"
        selected={selectedDate}
        onSelect={(d) => d && setSelectedDate(d)}
        month={currentMonth}
        hideNavigation
        classNames={{
          month: 'space-y-0',
          caption_label: 'text-sm font-medium hidden',
          week: 'flex w-full mt-1',
          // Restates the base `day` classes (classNames replace them) and gives
          // this month's days their own color: inheriting it through two
          // transition-colors layers left them near-invisible after a switch
          // to the dark theme.
          day: cn(
            'transition-colors rounded-md h-8 w-8 p-0 font-normal text-center text-sm mx-auto',
            '[&:not([data-today])]:hover:bg-muted-low [&:not([data-today])]:focus-visible:relative [&:not([data-today])]:focus-visible:z-20',
            '[data-selected="true"]:opacity-100',
            '[data-today="true"]:hover:bg-destructive/80',
            '[&:not([data-outside]):not([data-today]):not([data-disabled])]:text-foreground'
          ),
          // A visible keyboard focus ring (none showed), and no second color
          // transition under the cell's.
          day_button:
            'h-8 w-8 rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          // The selected day looked exactly like a hovered one: add a ring and
          // weight. Today keeps its own fill.
          selected: cn(
            '[&:not([data-today])]:bg-muted-low [&:not([data-today])]:text-foreground [&:not([data-today])]:hover:bg-muted-low/80',
            '[&:not([data-today])]:font-semibold [&:not([data-today])]:ring-1 [&:not([data-today])]:ring-inset [&:not([data-today])]:ring-foreground/30',
            '[data-today="true"]:bg-destructive [data-today="true"]:text-destructive-foreground'
          ),
          // Dark text on the dark theme's lighter rose (white was about 2.7:1).
          today:
            'bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:text-destructive-foreground dark:text-background dark:hover:text-background'
        }}
        onMonthChange={setCurrentMonth}
      />

      {/* Selected day: step a day either way, and the time zone times are
          shown in. (The day grid's own header repeated this date.) */}
      <div className="flex items-center gap-1 border-b p-2">
        <Button
          variant="ghost"
          sizeVariant="xs"
          typeVariant="icon"
          tooltip={t('calendar.previous_day')}
          onClick={() => stepDay(-1)}
        >
          <MonoIcon type="ChevronLeft" className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          sizeVariant="xs"
          typeVariant="icon"
          tooltip={t('calendar.next_day')}
          onClick={() => stepDay(1)}
        >
          <MonoIcon type="ChevronRight" className="h-4 w-4" />
        </Button>
        <div className="ml-1 flex min-w-0 items-center gap-1 text-sm font-medium">
          <span className="truncate">{format(selectedDate, 'EEE, MMM')}</span>
          <span
            className={cn(
              'flex h-5 min-w-5 items-center justify-center rounded-md px-1 tabular-nums',
              isSelectedToday && 'bg-destructive text-destructive-foreground dark:text-background'
            )}
          >
            {format(selectedDate, 'd')}
          </span>
          {!isSameYear(selectedDate, new Date()) && (
            <span className="shrink-0">{format(selectedDate, 'yyyy')}</span>
          )}
          <span
            className="ml-1 shrink-0 text-xs font-normal text-muted-foreground"
            title={`${getTimezoneLongName(userTimeZone, selectedDate)} (${userTimeZone})`}
          >
            {zoneAbbreviation}
          </span>
        </div>
        <Tabs
          className="ml-auto"
          value={viewMode}
          onValueChange={(v) => setViewMode(v as CalendarViewMode)}
        >
          <TabsList className="h-9">
            <TabsTrigger className="h-7" value="DAY">
              Day
            </TabsTrigger>
            <TabsTrigger className="h-7" value="AGENDA">
              Agenda
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {failedAccounts.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          <MonoIcon type="AlertCircle" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Couldn&apos;t load the calendar for{' '}
            {failedAccounts.map((acc) => acc.email || acc.displayName).join(', ')}
          </span>
          <Button
            variant="text"
            sizeVariant="xs"
            className="h-auto shrink-0 px-0 font-medium text-destructive hover:text-destructive/80"
            onClick={refresh}
            disabled={isRefreshing}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex min-h-0 w-full flex-1 duration-0">
        {viewMode === 'DAY' ? (
          <DayView
            date={selectedDate}
            numDays={1}
            events={dayEvents}
            activeEvent={getActiveEvent()}
            getEventDraftStatus={(id: string) => {
              const status = getEventStatus(id);
              switch (status) {
                case 'synced':
                  return 'none';
                case 'draft':
                  return 'draft';
                case 'saving':
                  return 'applying';
                case 'deleting':
                  return 'applying';
                case 'error':
                  return 'error';
                default:
                  return 'none';
              }
            }}
            onEventClick={(evt, target) => {
              const event = getEvent(evt.id);
              if (event) {
                handleEventClick(event, target || document.body);
              }
            }}
            onCreateEvent={onCreateEvent}
            onDragSelectionStart={onDragSelectionStart}
            onDragSelectionChange={onDragSelectionChange}
            onDragSelectionEnd={onDragSelectionEnd}
            onClearSelection={onClearSelection}
            isDragSelecting={isDragSelecting}
            dragSelection={dragSelection}
            pendingCreate={pendingCreate}
            onPendingCreateRendered={handlePendingCreateRendered}
            clearPendingCreate={() => setPendingCreate(null)}
            selectedTimeZone={selectedTimeZone}
            setSelectedTimeZone={setSelectedTimeZone}
            userTimeZone={userTimeZone}
            onEventDragEnd={(evt, newStart, newEnd) => {
              const event = getEvent(evt.id);
              if (event) {
                onEventDragEnd(event, newStart, newEnd);
              }
            }}
            preference={preference}
            selectedAccountUids={selectedAccountUids}
            pendingAccountUid={activeUid}
            scrollToNowNonce={scrollToNowNonce}
          />
        ) : (
          <AgendaList
            date={selectedDate}
            events={dayEvents}
            activeEventId={activeEventId}
            preference={preference}
            onEventClick={handleEventClick}
            onNewEvent={createNewEvent}
          />
        )}
      </div>
    </div>
  );
};

export default CalendarPanel;
