import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import MonoIcon, { type InboxIconType } from '@/renderer/app/components/icons/InboxIcon';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle
} from '@/renderer/app/components/ui/alert-dialog';
import { Button } from '@/renderer/app/components/ui/button';
import { formatSnoozeTime } from '@/renderer/app/hooks/useSnoozeThreads';
import { cn } from '@/renderer/app/lib/utils';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import type { ScheduledItem, SnoozedItem } from '@/renderer/app/store/queue/useQueueAtom';
import {
  buildSchedulePresets,
  type SchedulePreset
} from '@/renderer/app/containers/queue/schedulePresets';
import { QueueRow } from '@/renderer/app/containers/queue/QueueRow';
import { DBGetThread } from '@/renderer/app/lib/db/thread';
import { activeLayoutAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { activeThreadIdAtom, threadsMapAtom } from '@/renderer/app/store/thread/atoms';
import { useSetAtom, useStore } from 'jotai';
import { readerReturnLayoutAtom } from '@/renderer/app/store/layout/readerReturnAtom';

/**
 * Piece 2 of P8 — Later Queue UI.
 *
 * Top-level container for the "Later" view. Tabs between Snoozed and
 * Scheduled, groups items by time bucket, renders empty states when
 * there's nothing to show. State lives in useQueueAtom, which runs the
 * actions on the local scheduler over IPC. Every label comes from en.json
 * (`later.*`); dates and times follow the system locale, as the snooze
 * toast's do.
 */

type LaterQueueTab = 'snoozed' | 'scheduled';

type BucketKey = 'in-30-min' | 'later-today' | 'tomorrow' | 'this-week' | 'later';

const BUCKET_ORDER: BucketKey[] = ['in-30-min', 'later-today', 'tomorrow', 'this-week', 'later'];

const BUCKET_LABEL_KEYS: Record<BucketKey, string> = {
  // Holds everything due within 60 minutes (it said "In 30 min").
  'in-30-min': 'later.bucket.within_hour',
  'later-today': 'later.bucket.later_today',
  tomorrow: 'later.bucket.tomorrow',
  'this-week': 'later.bucket.this_week',
  later: 'later.bucket.later'
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function bucketFor(targetIso: string, now: Date): BucketKey {
  const target = new Date(targetIso);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 60 * 60 * 1000) return 'in-30-min';

  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrowStart);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  if (target < tomorrowStart) return 'later-today';
  if (target < dayAfterTomorrow) return 'tomorrow';
  if (target <= weekFromNow) return 'this-week';
  return 'later';
}

// Under the "Tomorrow" header the row doesn't need to repeat "Tomorrow".
function formatRelativeTime(
  targetIso: string,
  now: Date,
  t: TFunction,
  underTomorrowHeader = false
): string {
  const target = new Date(targetIso);
  const diffSec = (target.getTime() - now.getTime()) / 1000;
  const diffMin = diffSec / 60;
  const diffHour = diffMin / 60;

  if (diffSec <= 60) return t('later.time.now');
  if (diffMin < 60) return t('later.time.in_minutes', { count: Math.round(diffMin) });
  if (diffHour < 6 && target.toDateString() === now.toDateString()) {
    return t('later.time.in_hours', { count: Math.round(diffHour) });
  }

  const time = target.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (target.toDateString() === now.toDateString()) return time;

  const tomorrow = new Date(startOfDay(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.toDateString() === tomorrow.toDateString()) {
    return underTomorrowHeader ? time : t('later.time.tomorrow_at', { time });
  }

  const sixDaysOut = new Date(now);
  sixDaysOut.setDate(sixDaysOut.getDate() + 6);
  const day =
    target <= sixDaysOut
      ? target.toLocaleDateString(undefined, { weekday: 'short' })
      : target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return t('later.time.day_at', { day, time });
}

function recipientLabel(recipients: { name: string }[], t: TFunction): string {
  if (recipients.length === 0) return t('later.recipients.none');
  if (recipients.length === 1) return recipients[0].name;
  if (recipients.length === 2) {
    return t('later.recipients.two', { first: recipients[0].name, second: recipients[1].name });
  }
  return t('later.recipients.more', { first: recipients[0].name, others: recipients.length - 1 });
}

function groupByBucket<T>(items: T[], getIso: (item: T) => string, now: Date) {
  const out: Record<BucketKey, T[]> = {
    'in-30-min': [],
    'later-today': [],
    tomorrow: [],
    'this-week': [],
    later: []
  };
  for (const item of items) {
    out[bucketFor(getIso(item), now)].push(item);
  }
  for (const key of Object.keys(out) as BucketKey[]) {
    out[key].sort((a, b) => new Date(getIso(a)).getTime() - new Date(getIso(b)).getTime());
  }
  return out;
}

const QueueContainer: FC = () => {
  const { t } = useTranslation();
  const {
    snoozedItems,
    scheduledItems,
    unsnooze,
    rescheduleSnooze,
    cancelSchedule,
    rescheduleSend,
    sendScheduledNow
  } = useQueueAtom();
  const store = useStore();
  const setThreadsMap = useSetAtom(threadsMapAtom);
  const setActiveThreadId = useSetAtom(activeThreadIdAtom);
  const setActiveLayout = useSetAtom(activeLayoutAtom);
  const setReaderReturnLayout = useSetAtom(readerReturnLayoutAtom);

  // Read a snoozed email without bringing it back: open it in the reader.
  // Snoozed threads are out of the inbox list, so the thread is loaded from
  // the cache into memory first (the reader then fetches its bodies).
  const openSnoozed = async (item: SnoozedItem) => {
    if (!store.get(threadsMapAtom)[item.threadId]) {
      const loaded = await DBGetThread(item.accountId, item.threadId);
      if (!loaded) {
        toast.error(t('later.toast.open_error', { defaultValue: 'Couldn’t open this email' }));
        return;
      }
      setThreadsMap((prev) => (prev[loaded.id] ? prev : { ...prev, [loaded.id]: loaded }));
    }
    // Closing the email (Esc, U) comes back here, not to the Inbox.
    setReaderReturnLayout('LATER');
    setActiveLayout('MAIL');
    setActiveThreadId(item.threadId);
  };

  // Chosen once, when Later opens: Scheduled when only it has items, or when
  // a send was just scheduled (Send later opens this view right after). It
  // always opened on Snoozed. Never switched afterwards under the user.
  const [activeTab, setActiveTab] = useState<LaterQueueTab>(() => {
    if (snoozedItems.length === 0 && scheduledItems.length > 0) return 'scheduled';
    const newestSnoozed = Math.max(
      0,
      ...snoozedItems.map((item) => Date.parse(item.createdAt) || 0)
    );
    const newestScheduled = Math.max(
      0,
      ...scheduledItems.map((item) => Date.parse(item.createdAt) || 0)
    );
    return newestScheduled > newestSnoozed && Date.now() - newestScheduled < 15_000
      ? 'scheduled'
      : 'snoozed';
  });
  const [reschedulingItemId, setReschedulingItemId] = useState<string | null>(null);
  // A scheduled send waiting on the cancel confirmation.
  const [pendingCancel, setPendingCancel] = useState<ScheduledItem | null>(null);
  // `now` was frozen at mount: left open for a couple of hours, the relative
  // times went stale and "In 1 hour" rescheduled into the past. Tick it, and
  // refresh whenever a reschedule popover opens.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (reschedulingItemId) setNow(new Date());
  }, [reschedulingItemId]);
  const presets = useMemo(() => buildSchedulePresets(now), [now]);

  const subtitle =
    activeTab === 'snoozed' ? t('later.subtitle.snoozed') : t('later.subtitle.scheduled');

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-[10%] backdrop-blur-md">
        {/* The titlebar tab already names the view; the big title only took
            room above the list. */}
        <h2 className="sr-only">{t('later.title')}</h2>
        <div className="flex items-center gap-4">
          <nav
            aria-label={t('later.tabs_label')}
            className="-mb-px flex items-center gap-1 text-sm"
          >
            <TabButton
              active={activeTab === 'snoozed'}
              count={snoozedItems.length}
              onClick={() => setActiveTab('snoozed')}
            >
              {t('later.tab.snoozed')}
            </TabButton>
            <TabButton
              active={activeTab === 'scheduled'}
              count={scheduledItems.length}
              onClick={() => setActiveTab('scheduled')}
            >
              {t('later.tab.scheduled')}
            </TabButton>
          </nav>
          <p className="ml-auto hidden truncate text-xs text-muted-foreground sm:block">
            {subtitle}
          </p>
        </div>
      </header>

      {activeTab === 'snoozed' ? (
        <SnoozedTab
          items={snoozedItems}
          now={now}
          presets={presets}
          reschedulingItemId={reschedulingItemId}
          onOpenRescheduleFor={setReschedulingItemId}
          onOpen={openSnoozed}
          onBringBackNow={async (id) => {
            const res = await unsnooze(id);
            if (!res.ok) toast.error(t('later.toast.bring_back_error', { error: res.error }));
            else toast.success(t('later.toast.brought_back'));
          }}
          onRescheduleSnooze={async (id, until) => {
            // Closed first: a second pick while this one ran rescheduled twice.
            setReschedulingItemId(null);
            const res = await rescheduleSnooze(id, until);
            if (!res.ok) toast.error(t('later.toast.reschedule_error', { error: res.error }));
            else toast.success(t('toast.snooze.success', { time: formatSnoozeTime(until) }));
          }}
        />
      ) : (
        <ScheduledTab
          items={scheduledItems}
          now={now}
          presets={presets}
          reschedulingItemId={reschedulingItemId}
          onOpenRescheduleFor={setReschedulingItemId}
          onSendNow={async (id) => {
            // Actually fire the send via the dedicated endpoint — the
            // mock backend will broadcast SCHEDULED_SENT which clears
            // the cache too, but we drop it optimistically on success.
            const res = await sendScheduledNow(id);
            if (!res.ok) toast.error(t('later.toast.send_now_error', { error: res.error }));
            else toast.success(t('later.toast.sent'));
          }}
          onCancelSchedule={(id) => {
            const item = scheduledItems.find((scheduled) => scheduled.id === id);
            if (item) setPendingCancel(item);
          }}
          onRescheduleSend={async (id, when) => {
            setReschedulingItemId(null);
            const res = await rescheduleSend(id, when);
            if (!res.ok) toast.error(t('later.toast.reschedule_error', { error: res.error }));
            else toast.success(t('toast.compose.scheduled', { time: formatSnoozeTime(when) }));
          }}
        />
      )}

      {/* Cancelling deletes the message for good: the draft was removed when
          it was scheduled, so ask first (it acted on one click). */}
      <AlertDialog
        open={!!pendingCancel}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className="dark" />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                {t('later.cancel_dialog.title')}
              </AlertDialogTitle>
              <AlertDialogDescription>{t('later.cancel_dialog.body')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('later.cancel_dialog.keep')}</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  const item = pendingCancel;
                  setPendingCancel(null);
                  if (!item) return;
                  const res = await cancelSchedule(item.id);
                  if (!res.ok) toast.error(t('later.toast.cancel_error', { error: res.error }));
                  else toast.success(t('later.toast.cancelled'));
                }}
              >
                {t('later.action.cancel_send')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  count: number;
  onClick?: () => void;
  children: React.ReactNode;
}

function TabButton({ active, count, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative rounded-sm px-1 py-3 font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="inline-flex items-baseline gap-1.5 px-2">
        {children}
        <span
          className={cn(
            'text-[11px] tabular-nums',
            active ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}
        >
          {count}
        </span>
      </span>
      {/* A neutral underline (red is the compose accent). */}
      {active && <span className="absolute inset-x-0 -bottom-px h-px bg-foreground" />}
    </button>
  );
}

interface SnoozedTabProps {
  items: SnoozedItem[];
  now: Date;
  presets: SchedulePreset[];
  reschedulingItemId: string | null;
  onOpenRescheduleFor: (id: string | null) => void;
  onOpen: (item: SnoozedItem) => void;
  onBringBackNow: (id: string) => void;
  onRescheduleSnooze: (id: string, snoozeUntil: string) => void;
}

function SnoozedTab({
  items,
  now,
  presets,
  reschedulingItemId,
  onOpenRescheduleFor,
  onOpen,
  onBringBackNow,
  onRescheduleSnooze
}: SnoozedTabProps) {
  const { t } = useTranslation();
  const grouped = useMemo(() => groupByBucket(items, (i) => i.snoozeUntil, now), [items, now]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="Inbox"
        title={t('later.empty.snoozed_title')}
        body={t('later.empty.snoozed_body')}
      />
    );
  }

  return (
    <div className="pb-24">
      {BUCKET_ORDER.map((bucket) => {
        const bucketItems = grouped[bucket];
        if (!bucketItems.length) return null;
        return (
          <section key={bucket} aria-labelledby={`bucket-${bucket}`}>
            <BucketHeader id={`bucket-${bucket}`} label={t(BUCKET_LABEL_KEYS[bucket])} />
            <ul>
              {bucketItems.map((item) => (
                <li key={item.id}>
                  <QueueRow
                    variant="snoozed"
                    itemId={item.id}
                    accountId={item.accountId}
                    primaryName={item.sender.name}
                    primaryEmail={item.sender.email}
                    subject={item.subject}
                    snippet={item.snippet}
                    timeLabel={formatRelativeTime(item.snoozeUntil, now, t, bucket === 'tomorrow')}
                    isUrgent={bucket === 'in-30-min'}
                    isStarred={item.isStarred}
                    reschedulePresets={presets}
                    isRescheduling={reschedulingItemId === item.id}
                    onPrimaryAction={() => onBringBackNow(item.id)}
                    onOpen={() => onOpen(item)}
                    onOpenReschedule={() => onOpenRescheduleFor(item.id)}
                    onCloseReschedule={() => onOpenRescheduleFor(null)}
                    onPickReschedule={(preset) => {
                      if (preset.scheduledFor) onRescheduleSnooze(item.id, preset.scheduledFor);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface ScheduledTabProps {
  items: ScheduledItem[];
  now: Date;
  presets: SchedulePreset[];
  reschedulingItemId: string | null;
  onOpenRescheduleFor: (id: string | null) => void;
  onSendNow: (id: string) => void;
  onCancelSchedule: (id: string) => void;
  onRescheduleSend: (id: string, when: string) => void;
}

function ScheduledTab({
  items,
  now,
  presets,
  reschedulingItemId,
  onOpenRescheduleFor,
  onSendNow,
  onCancelSchedule,
  onRescheduleSend
}: ScheduledTabProps) {
  const { t } = useTranslation();
  const grouped = useMemo(() => groupByBucket(items, (i) => i.scheduledFor, now), [items, now]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="Send"
        title={t('later.empty.scheduled_title')}
        body={t('later.empty.scheduled_body')}
      />
    );
  }

  return (
    <div className="pb-24">
      {BUCKET_ORDER.map((bucket) => {
        const bucketItems = grouped[bucket];
        if (!bucketItems.length) return null;
        return (
          <section key={bucket} aria-labelledby={`bucket-${bucket}`}>
            <BucketHeader id={`bucket-${bucket}`} label={t(BUCKET_LABEL_KEYS[bucket])} />
            <ul>
              {bucketItems.map((item) => (
                <li key={item.id}>
                  <QueueRow
                    variant="scheduled"
                    itemId={item.id}
                    accountId={item.accountId}
                    primaryName={t('later.recipients.to', {
                      name: recipientLabel(item.recipients, t)
                    })}
                    primaryEmail={item.recipients[0]?.email ?? ''}
                    subject={item.subject}
                    snippet={item.bodySnippet}
                    timeLabel={formatRelativeTime(item.scheduledFor, now, t, bucket === 'tomorrow')}
                    isUrgent={bucket === 'in-30-min'}
                    attachmentCount={item.attachmentCount}
                    reschedulePresets={presets}
                    isRescheduling={reschedulingItemId === item.id}
                    onPrimaryAction={() => onSendNow(item.id)}
                    onCancel={() => onCancelSchedule(item.id)}
                    onOpenReschedule={() => onOpenRescheduleFor(item.id)}
                    onCloseReschedule={() => onOpenRescheduleFor(null)}
                    onPickReschedule={(preset) => {
                      if (preset.scheduledFor) onRescheduleSend(item.id, preset.scheduledFor);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface BucketHeaderProps {
  id: string;
  label: string;
}

// The inbox's group header (the tracked mono label style was dropped).
function BucketHeader({ id, label }: BucketHeaderProps) {
  return (
    <h3
      id={id}
      className="px-[10%] pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
    >
      {label}
    </h3>
  );
}

interface EmptyStateProps {
  icon: InboxIconType;
  title: string;
  body: string;
}

// The inbox's empty state: muted icon and text, no ringed badge or big title.
function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[10%] py-24 text-center">
      <MonoIcon type={icon} size={32} weight={300} className="mb-3 text-muted-foreground/40" />
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground/60">{body}</p>
    </div>
  );
}

export default QueueContainer;
