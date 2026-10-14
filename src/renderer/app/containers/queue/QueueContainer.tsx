import { FC, useEffect, useMemo, useState } from 'react';
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
import { cn } from '@/renderer/app/lib/utils';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import type { ScheduledItem, SnoozedItem } from '@/renderer/app/store/queue/useQueueAtom';
import {
  buildSchedulePresets,
  type SchedulePreset
} from '@/renderer/app/containers/queue/schedulePresets';
import { QueueRow } from '@/renderer/app/containers/queue/QueueRow';

/**
 * Piece 2 of P8 — Later Queue UI.
 *
 * Top-level container for the "Later" view. Tabs between Snoozed and
 * Scheduled, groups items by time bucket, renders empty states when
 * there's nothing to show. State lives in useQueueAtom (client-only;
 * snooze/schedule actions are wired through the atom for now, will be
 * replaced with backend IPC when pieces 4 + 6 land).
 */

type LaterQueueTab = 'snoozed' | 'scheduled';

type BucketKey = 'in-30-min' | 'later-today' | 'tomorrow' | 'this-week' | 'later';

const BUCKET_ORDER: BucketKey[] = ['in-30-min', 'later-today', 'tomorrow', 'this-week', 'later'];

const BUCKET_LABELS: Record<BucketKey, string> = {
  // Holds everything due within 60 minutes (it said "In 30 min").
  'in-30-min': 'Within the hour',
  'later-today': 'Later today',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
  later: 'Later'
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

function formatRelativeTime(targetIso: string, now: Date): string {
  const target = new Date(targetIso);
  const diffSec = (target.getTime() - now.getTime()) / 1000;
  const diffMin = diffSec / 60;
  const diffHour = diffMin / 60;

  if (diffSec <= 60) return 'now';
  if (diffMin < 60) return `in ${Math.round(diffMin)} min`;
  if (diffHour < 6 && target.toDateString() === now.toDateString()) {
    return `in ${Math.round(diffHour)} hr`;
  }

  const time = target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (target.toDateString() === now.toDateString()) return time;

  const tomorrow = new Date(startOfDay(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;

  const sixDaysOut = new Date(now);
  sixDaysOut.setDate(sixDaysOut.getDate() + 6);
  if (target <= sixDaysOut) {
    const weekday = target.toLocaleDateString('en-US', { weekday: 'short' });
    return `${weekday} · ${time}`;
  }

  const monthDay = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${monthDay} · ${time}`;
}

// Under the "Tomorrow" header the row doesn't need to repeat "Tomorrow".
function rowTimeLabel(targetIso: string, now: Date, bucket: BucketKey): string {
  const label = formatRelativeTime(targetIso, now);
  return bucket === 'tomorrow' ? label.replace(/^Tomorrow · /, '') : label;
}

// "Tue, Oct 13, 8:00 AM", as the snooze toast writes it.
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

function recipientLabel(recipients: { name: string }[]): string {
  if (recipients.length === 0) return 'No recipient';
  if (recipients.length === 1) return recipients[0].name;
  if (recipients.length === 2) return `${recipients[0].name}, ${recipients[1].name}`;
  return `${recipients[0].name} + ${recipients.length - 1}`;
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
  const {
    snoozedItems,
    scheduledItems,
    unsnooze,
    rescheduleSnooze,
    cancelSchedule,
    rescheduleSend,
    sendScheduledNow
  } = useQueueAtom();

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
    activeTab === 'snoozed'
      ? 'Returning to your inbox at the time you chose.'
      : 'Going out at the time you scheduled.';

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-[10%] backdrop-blur-md">
        {/* The titlebar tab already names the view; the big title only took
            room above the list. */}
        <h2 className="sr-only">Later</h2>
        <div className="flex items-center gap-4">
          <nav aria-label="Later queue tabs" className="-mb-px flex items-center gap-1 text-sm">
            <TabButton
              active={activeTab === 'snoozed'}
              count={snoozedItems.length}
              onClick={() => setActiveTab('snoozed')}
            >
              Snoozed
            </TabButton>
            <TabButton
              active={activeTab === 'scheduled'}
              count={scheduledItems.length}
              onClick={() => setActiveTab('scheduled')}
            >
              Scheduled
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
          onBringBackNow={async (id) => {
            const res = await unsnooze(id);
            if (!res.ok) toast.error(`Couldn't bring back: ${res.error}`);
            else toast.success('Moved back to Inbox');
          }}
          onRescheduleSnooze={async (id, until) => {
            // Closed first: a second pick while this one ran rescheduled twice.
            setReschedulingItemId(null);
            const res = await rescheduleSnooze(id, until);
            if (!res.ok) toast.error(`Couldn't reschedule: ${res.error}`);
            else toast.success(`Snoozed until ${formatWhen(until)}`);
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
            if (!res.ok) toast.error(`Couldn't send now: ${res.error}`);
            else toast.success('Sent');
          }}
          onCancelSchedule={(id) => {
            const item = scheduledItems.find((scheduled) => scheduled.id === id);
            if (item) setPendingCancel(item);
          }}
          onRescheduleSend={async (id, when) => {
            setReschedulingItemId(null);
            const res = await rescheduleSend(id, when);
            if (!res.ok) toast.error(`Couldn't reschedule: ${res.error}`);
            else toast.success(`Scheduled for ${formatWhen(when)}`);
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
                Cancel this scheduled message?
              </AlertDialogTitle>
              <AlertDialogDescription>
                It won&apos;t be sent and is removed from Later. No copy of it is kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  const item = pendingCancel;
                  setPendingCancel(null);
                  if (!item) return;
                  const res = await cancelSchedule(item.id);
                  if (!res.ok) toast.error(`Couldn't cancel: ${res.error}`);
                  else toast.success('Scheduled send cancelled');
                }}
              >
                Cancel send
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
  onBringBackNow: (id: string) => void;
  onRescheduleSnooze: (id: string, snoozeUntil: string) => void;
}

function SnoozedTab({
  items,
  now,
  presets,
  reschedulingItemId,
  onOpenRescheduleFor,
  onBringBackNow,
  onRescheduleSnooze
}: SnoozedTabProps) {
  const grouped = useMemo(() => groupByBucket(items, (i) => i.snoozeUntil, now), [items, now]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="Inbox"
        title="Nothing snoozed"
        body="Snoozed emails will show up here, grouped by when they come back."
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
            <BucketHeader id={`bucket-${bucket}`} label={BUCKET_LABELS[bucket]} />
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
                    timeLabel={rowTimeLabel(item.snoozeUntil, now, bucket)}
                    isUrgent={bucket === 'in-30-min'}
                    isStarred={item.isStarred}
                    reschedulePresets={presets}
                    isRescheduling={reschedulingItemId === item.id}
                    onPrimaryAction={() => onBringBackNow(item.id)}
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
  const grouped = useMemo(() => groupByBucket(items, (i) => i.scheduledFor, now), [items, now]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="Send"
        title="No scheduled messages"
        body="Anything you choose to send later will land here. Reschedule, send now, or cancel."
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
            <BucketHeader id={`bucket-${bucket}`} label={BUCKET_LABELS[bucket]} />
            <ul>
              {bucketItems.map((item) => {
                const primaryName = recipientLabel(item.recipients);
                return (
                  <li key={item.id}>
                    <QueueRow
                      variant="scheduled"
                      itemId={item.id}
                      accountId={item.accountId}
                      primaryName={`To ${primaryName}`}
                      primaryEmail={item.recipients[0]?.email ?? ''}
                      subject={item.subject}
                      snippet={item.bodySnippet}
                      timeLabel={rowTimeLabel(item.scheduledFor, now, bucket)}
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
                );
              })}
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
