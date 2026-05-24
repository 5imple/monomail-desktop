import { FC, useMemo, useState } from 'react';
import { Inbox, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/renderer/app/lib/utils';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import type { ScheduledItem, SnoozedItem } from '@/renderer/app/store/queue/useQueueAtom';
import {
  buildSchedulePresets,
  type SchedulePreset
} from '@/renderer/app/containers/queue/schedulePresets';
import { QueueRow, initialsFor } from '@/renderer/app/containers/queue/QueueRow';

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
  'in-30-min': 'In 30 min',
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
    out[key].sort(
      (a, b) => new Date(getIso(a)).getTime() - new Date(getIso(b)).getTime()
    );
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

  const [activeTab, setActiveTab] = useState<LaterQueueTab>('snoozed');
  const [reschedulingItemId, setReschedulingItemId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const presets = useMemo(() => buildSchedulePresets(now), [now]);

  const subtitle =
    activeTab === 'snoozed'
      ? 'Returning to your inbox at the time you chose.'
      : 'Going out at the time you scheduled.';

  return (
    <div className="h-full w-full overflow-auto bg-white dark:bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-white/80 px-6 pt-10 pb-0 backdrop-blur-md sm:px-10 dark:bg-background/80">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="font-sans text-3xl font-medium tracking-tight text-foreground">
              Later
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <nav
          aria-label="Later queue tabs"
          className="mt-4 -mb-px flex items-center gap-1 text-sm"
        >
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
          }}
          onCancelSnooze={async (id) => {
            const res = await unsnooze(id);
            if (!res.ok) toast.error(`Couldn't cancel snooze: ${res.error}`);
          }}
          onRescheduleSnooze={async (id, until) => {
            const res = await rescheduleSnooze(id, until);
            setReschedulingItemId(null);
            if (!res.ok) toast.error(`Couldn't reschedule: ${res.error}`);
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
          }}
          onCancelSchedule={async (id) => {
            const res = await cancelSchedule(id);
            if (!res.ok) toast.error(`Couldn't cancel: ${res.error}`);
          }}
          onRescheduleSend={async (id, when) => {
            const res = await rescheduleSend(id, when);
            setReschedulingItemId(null);
            if (!res.ok) toast.error(`Couldn't reschedule: ${res.error}`);
          }}
        />
      )}
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
      className={cn(
        'relative px-1 py-3 font-medium tracking-tight transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="inline-flex items-baseline gap-1.5 px-2">
        {children}
        <span
          className={cn(
            'font-mono text-[11px] tabular-nums',
            active ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}
        >
          {count}
        </span>
      </span>
      {active && <span className="absolute inset-x-0 -bottom-px h-px bg-red-500" />}
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
  onCancelSnooze: (id: string) => void;
  onRescheduleSnooze: (id: string, snoozeUntil: string) => void;
}

function SnoozedTab({
  items,
  now,
  presets,
  reschedulingItemId,
  onOpenRescheduleFor,
  onBringBackNow,
  onCancelSnooze,
  onRescheduleSnooze
}: SnoozedTabProps) {
  const grouped = useMemo(() => groupByBucket(items, (i) => i.snoozeUntil, now), [items, now]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing snoozed"
        body="Inbox is quiet. Anything you snooze will appear here, grouped by when it returns."
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
            <ul className="divide-y divide-border/60">
              {bucketItems.map((item) => (
                <li key={item.id}>
                  <QueueRow
                    variant="snoozed"
                    itemId={item.id}
                    primaryName={item.sender.name}
                    primaryHueId={item.sender.id}
                    primaryInitials={initialsFor(item.sender.name)}
                    subject={item.subject}
                    snippet={item.snippet}
                    timeLabel={formatRelativeTime(item.snoozeUntil, now)}
                    isUrgent={bucket === 'in-30-min'}
                    isStarred={item.isStarred}
                    reschedulePresets={presets}
                    isRescheduling={reschedulingItemId === item.id}
                    onPrimaryAction={() => onBringBackNow(item.id)}
                    onCancel={() => onCancelSnooze(item.id)}
                    onClickTime={() =>
                      onOpenRescheduleFor(reschedulingItemId === item.id ? null : item.id)
                    }
                    onCloseReschedule={() => onOpenRescheduleFor(null)}
                    onPickReschedule={(preset) => {
                      if (preset.scheduledFor) onRescheduleSnooze(item.id, preset.scheduledFor);
                    }}
                    onPickCustomReschedule={() => onOpenRescheduleFor(null)}
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
  const grouped = useMemo(
    () => groupByBucket(items, (i) => i.scheduledFor, now),
    [items, now]
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Send}
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
            <ul className="divide-y divide-border/60">
              {bucketItems.map((item) => {
                const primaryName = recipientLabel(item.recipients);
                const hueAnchor = item.recipients[0]?.id ?? item.id;
                return (
                  <li key={item.id}>
                    <QueueRow
                      variant="scheduled"
                      itemId={item.id}
                      primaryName={`To ${primaryName}`}
                      primaryHueId={hueAnchor}
                      primaryInitials={initialsFor(item.recipients[0]?.name ?? '?')}
                      subject={item.subject}
                      snippet={item.bodySnippet}
                      timeLabel={formatRelativeTime(item.scheduledFor, now)}
                      isUrgent={bucket === 'in-30-min'}
                      attachmentCount={item.attachmentCount}
                      reschedulePresets={presets}
                      isRescheduling={reschedulingItemId === item.id}
                      onPrimaryAction={() => onSendNow(item.id)}
                      onCancel={() => onCancelSchedule(item.id)}
                      onClickTime={() =>
                        onOpenRescheduleFor(reschedulingItemId === item.id ? null : item.id)
                      }
                      onCloseReschedule={() => onOpenRescheduleFor(null)}
                      onPickReschedule={(preset) => {
                        if (preset.scheduledFor) onRescheduleSend(item.id, preset.scheduledFor);
                      }}
                      onPickCustomReschedule={() => onOpenRescheduleFor(null)}
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

function BucketHeader({ id, label }: BucketHeaderProps) {
  return (
    <h3
      id={id}
      className="px-8 pt-8 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:px-12"
    >
      {label}
    </h3>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}

function EmptyState({ icon: Icon, title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 pt-24 pb-32 text-center sm:px-10">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border">
        <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-[20px] font-medium tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

export default QueueContainer;
