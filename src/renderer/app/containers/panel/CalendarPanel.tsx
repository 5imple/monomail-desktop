import calendarApi from '@/main/api/calendar/calendarApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Calendar } from '@/renderer/app/components/ui/calendar';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/renderer/app/components/ui/tabs';
import CalendarEventEditor from '@/renderer/app/containers/panel/calendar/CalendarEventEditor';
import AccountSelector from '@/renderer/app/components/calendar/AccountSelector';
import type { CalendarEvent } from '@/renderer/app/store/calendar/calendarAtoms';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import type {
  CalendarEventID,
  CalendarViewMode
} from '@/renderer/app/store/calendar/calendarAtoms';
import { useCalendar } from '@/renderer/app/store/calendar/useCalendar';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { parseEventDate } from '@/renderer/app/containers/panel/calendar/utils';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import type { Instance } from 'tippy.js';
import tippy from 'tippy.js';
import DayView from './calendar/DayView';
import { CalendarDragSelection } from '@/renderer/app/store/calendar/calendarAtoms';

type PopoverMode = 'create' | 'edit';

interface CalendarPanelProps {
  className?: string;
}

// Agenda list for a specific date
const AgendaList: React.FC<{
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent, anchorEl: HTMLElement) => void;
}> = ({ events, onEventClick }) => {
  return (
    <ScrollArea className="h-full w-full">
      <ul className="divide-y">
        {events.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">No events</li>
        )}
        {events.map((evt) => (
          <li
            key={evt.id}
            className="px-3 py-2"
            onClick={(e) => onEventClick(evt, e.currentTarget)}
          >
            <div className="line-clamp-1 text-sm font-medium text-foreground">{evt.title}</div>
            <div className="text-xs text-muted-foreground">
              {format(
                parseEventDate(evt.allDay ? evt.start.date : evt.start.dateTime) || new Date(),
                'p'
              )}{' '}
              –{' '}
              {format(
                parseEventDate(evt.allDay ? evt.end.date : evt.end.dateTime) || new Date(),
                'p'
              )}
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
};

const CalendarPanel: React.FC<CalendarPanelProps> = ({ className }) => {
  // ============================================================================
  // CLEAN CALENDAR HOOK
  // ============================================================================
  const {
    // Core state
    today,
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
    removeEvent,
    updateEventFields,
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

  // Track an active popover's re-render function so we can update content without closing
  const activePopoverRerenderRef = useRef<null | (() => void)>(null);
  const activePopoverEventIdRef = useRef<string | null>(null);

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

  const fetchMonth = async (m: Date, uid: string | null) => {
    if (!uid) return;
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

    try {
      const data = await calendarApi.getGoogleCalendarEvents(
        {
          calendarId: 'primary',
          timeMin: startOfMonth(m).toISOString(),
          timeMax: endOfMonth(m).toISOString(),
          uid
        },
        controller.signal
      );

      // Load events into clean state
      loadGoogleEvents(data.items, uid);
    } catch {
      // noop
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
  // briefly []. Fires once per session — no more manual refresh on first open.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    if (accounts.length === 0) return;
    initialFetchedRef.current = true;
    const uids = accounts.map((a) => a.uid);
    const monthsToFetch = getPreloadMonths(currentMonth);
    uids.forEach((uid) => monthsToFetch.forEach((m) => fetchMonth(m, uid)));
  }, [accounts.length, currentMonth, getPreloadMonths]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const goToday = () => {
    setSelectedDate(today);
    setCurrentMonth(today);
  };

  const goPrevMonth = () => setCurrentMonth((d) => subMonths(d, 1));
  const goNextMonth = () => setCurrentMonth((d) => addMonths(d, 1));

  // Close editor when date changes
  useEffect(() => {
    if (activePopoverRef.current) {
      activePopoverRef.current.hide();
    }
  }, [selectedDate]);

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
    let scrollViewport: HTMLElement | null = null;

    // Find the scroll area viewport for the anchor element
    if (anchor.el) {
      scrollViewport = findScrollAreaViewport(anchor.el);
    }

    const root = createRoot(container);
    let instance: Instance | null = null;
    let rafId: number | null = null;

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
      // Only clear if the closing instance is the one currently tracked
      if (!closingInst || activePopoverRef.current === closingInst) {
        activePopoverRef.current = null;
      }
      root.unmount();
      // Clear the active selection when the editor closes
      try {
        setActiveEvent(null);
      } catch {
        // ignore
      }
      try {
        if (typeof onCloseComplete === 'function') onCloseComplete();
      } catch {
        // noop
      }
    };

    const destroy = () => {
      try {
        instance?.destroy?.();
      } finally {
        finalize(instance);
      }
    };

    const renderEditor = () =>
      root.render(
        <CalendarEventEditor
          mode={mode}
          accounts={accounts}
          eventId={eventId}
          defaultValues={defaults}
          onClose={destroy}
          onEventCreated={(createdEventId) => {
            // Update active event to the newly created one
            const createdEvent = getEvent(createdEventId);
            if (createdEvent) {
              setActiveEvent(createdEvent);
            }
            toast.success('Event created successfully');

            // Refresh events for the target month
            if (activeUid) {
              const targetMonth = defaults?.start ? new Date(defaults.start) : new Date();
              fetchMonth(targetMonth, activeUid);
            }
          }}
          onEventUpdated={() => {
            // Refresh events when an event is updated
            if (activeUid) {
              const targetMonth = defaults?.start ? new Date(defaults.start) : new Date();
              fetchMonth(targetMonth, activeUid);
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
      );

    renderEditor();

    // allow external refresh when draftChanges changes
    activePopoverRerenderRef.current = renderEditor;
    activePopoverEventIdRef.current = eventId || null;

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
      instance = tippy(document.body, {
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
            if (inst.popper.contains(target)) return;
            // Allow interactions with our portaled dropdowns/selects that are marked to keep
            const keep = target?.closest('[data-calendar-keep-popover="true"]');
            if (keep) return;
            instance?.hide?.();
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
    const start = new Date(date);
    if (hour !== undefined) start.setHours(hour);
    if (minute !== undefined) start.setMinutes(minute);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 60 * 60 * 1000);
    openEventPopover(
      anchor && 'rect' in anchor
        ? { rect: anchor.rect }
        : anchor && 'clientX' in anchor
          ? { point: anchor }
          : { rect: { left: 300, top: 200, width: 0, height: 0 } },
      'create',
      {
        start,
        end
      }
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
    // Defer opening; render a temporary event block and anchor popover to it
    setPendingCreate({ start, end });
    setIsDragSelecting(false);
    setDragSelection(null);
  };

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
    // Use clean architecture's moveEvent method with accounts info
    // Create a local moveEvent wrapper that includes accounts
    const moveEventWithAccounts = (eventId: string, newStart: Date, newEnd: Date) => {
      const accountsInfo = accounts.map((acc) => ({ uid: acc.uid, email: acc.email }));
      updateEventFields(
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

    moveEventWithAccounts(event.id, newStart, newEnd);

    // Check if event has attendees to determine notification behavior
    const eventHasAttendees = hasAttendees(event.id);
    if (eventHasAttendees) {
      // Show draft status message
      toast.success('Event moved to draft - edit to send updates');
    } else {
      // For events without attendees, changes are auto-applied
      toast.success('Event updated successfully');
    }

    // Open the editor near the dragged element for quick fine-tuning
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

  // Request deletion (optimistic), with optional notifications flag
  const requestDeleteEvent = async (eventId: CalendarEventID, sendNotifications = true) => {
    if (!activeUid) return;

    // Close popover and clear selection immediately
    try {
      activePopoverRef.current?.hide?.();
    } catch {
      // ignore
    }

    const activeEvent = getActiveEvent();
    if (activeEvent?.id === eventId) setActiveEvent(null);

    try {
      await removeEvent(eventId, sendNotifications);
      toast.success('Event deleted');
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Failed to delete event');
    }
  };

  // Global keyboard shortcuts for calendar interaction
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/control
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (target && (target as HTMLElement).isContentEditable);

      if (e.key === 'Escape') {
        if (activePopoverRef.current) {
          e.preventDefault();
          try {
            activePopoverRef.current.hide();
          } catch {
            // ignore
          }
        }
        const activeEvent = getActiveEvent();
        if (activeEvent) {
          setActiveEvent(null);
        }
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && !isEditable) {
        const activeEvent = getActiveEvent();
        if (activeEvent) {
          e.preventDefault();
          requestDeleteEvent(activeEvent.id, true);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={cn('no-drag flex h-full w-full flex-col', className)}>
      {/* Header */}
      <div className="drag flex items-center gap-2 p-2 pb-0">
        <div className="ml-1 line-clamp-1 shrink-0 font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </div>

        <Button
          variant="ghost"
          sizeVariant="sm"
          typeVariant="icon"
          onClick={async () => {
            if (isRefreshing) return; // Prevent multiple simultaneous refreshes

            setIsRefreshing(true);
            try {
              // Refresh current month for all selected accounts
              await Promise.all(selectedAccountUids.map((uid) => fetchMonth(currentMonth, uid)));

              // Add a small delay to ensure state propagation
              await new Promise((resolve) => setTimeout(resolve, 100));

              console.log('Calendar refresh completed. Current dayEvents:', dayEvents.length);
              toast.success('Calendar refreshed successfully');
            } catch (error) {
              console.error('Failed to refresh calendar:', error);
              toast.error('Failed to refresh calendar');
            } finally {
              setIsRefreshing(false);
            }
          }}
          className="ml-1"
          disabled={isRefreshing}
        >
          <MonoIcon
            type="RotateCcw"
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform duration-300',
              isRefreshing && '-rotate-180'
            )}
          />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {/* <AccountSelector
            accounts={accounts}
            selectedAccountUids={selectedAccountUids}
            onSelectionChange={setSelectedAccountUids}
            preference={preference}
          /> */}
          <Button variant="secondary" sizeVariant="sm" typeVariant="icon" onClick={goPrevMonth}>
            <MonoIcon type="ChevronLeft" />
          </Button>
          <Button variant="secondary" sizeVariant="sm" typeVariant="icon" onClick={goNextMonth}>
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
          caption_label: 'text-sm font-medium hidden'
        }}
        onMonthChange={setCurrentMonth}
      />

      {/* View switch */}
      <div className="flex items-center justify-between border-b p-2">
        <div className="ml-2 text-sm font-medium">{format(selectedDate, 'MMMM d, yyyy')}</div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as CalendarViewMode)}>
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
          />
        ) : (
          <AgendaList date={selectedDate} events={dayEvents} onEventClick={handleEventClick} />
        )}
      </div>
    </div>
  );
};

export default CalendarPanel;
