import React from 'react';
import { cn } from '@/renderer/app/lib/utils';

/**
 * Date separator between thread groups in the inbox list.
 *
 * Newton aesthetic: small monospaced uppercase label, tracked letter
 * spacing, muted color. The previous design used a colored top-border
 * cube with the day-of-month inside; Newton's calm aesthetic prefers a
 * quiet typographic "chapter marker" instead.
 */
const DateSeparator = ({
  date,
  isScrolled
}: {
  date: string;
  isScrolled: boolean;
  firstThreadTimestamp: number;
}) => {
  return (
    <div
      className={cn(
        'sticky top-0 z-40 bg-card/95 px-6 pt-6 pb-2 backdrop-blur-sm',
        isScrolled && 'border-b border-border/60'
      )}
    >
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {date}
      </h3>
    </div>
  );
};

export default DateSeparator;
