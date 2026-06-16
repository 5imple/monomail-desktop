import { Skeleton } from '@/renderer/app/components/ui/skeleton';
import { cn } from '@/renderer/app/lib/utils';
import { motion } from 'motion/react';

interface ThreadListSkeletonProps {
  count?: number;
  density?: string;
}

// Organic-looking subject widths so the placeholder rows don't read as a
// uniform striped block.
const SUBJECT_WIDTHS = ['w-2/5', 'w-3/5', 'w-1/2', 'w-7/12', 'w-1/3', 'w-2/3', 'w-5/12'];

/**
 * Placeholder rows shown while the thread list is loading and has no cached
 * content yet. Mirrors the cozy/dense row geometry (mx-[10%], avatar + sender +
 * subject + date) so the real list slots in without a layout jump, and the rows
 * fade in with a short stagger to read as "content is arriving" rather than a
 * dead spinner.
 */
export default function ThreadListSkeleton({
  count = 9,
  density = 'comfortable'
}: ThreadListSkeletonProps) {
  const isDense = density === 'compact';

  return (
    <div className="flex w-full flex-col pt-2" aria-hidden="true">
      <div className="px-[10%] pb-1 pt-3">
        <Skeleton className="h-2.5 w-16 rounded" />
      </div>
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35, ease: 'easeOut' }}
          className="mx-[10%]"
        >
          <div
            className={cn(
              'flex items-center gap-3 border-b border-border/40 px-3',
              isDense ? 'py-1.5' : 'py-[11px]'
            )}
          >
            <Skeleton
              className={cn('shrink-0 rounded-full', isDense ? 'h-5 w-5' : 'h-8 w-8')}
            />
            <Skeleton className={cn('h-3 shrink-0 rounded', isDense ? 'w-24' : 'w-32')} />
            <Skeleton className={cn('h-3 rounded', SUBJECT_WIDTHS[index % SUBJECT_WIDTHS.length])} />
            <div className="flex-1" />
            <Skeleton className="h-2.5 w-10 shrink-0 rounded" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
