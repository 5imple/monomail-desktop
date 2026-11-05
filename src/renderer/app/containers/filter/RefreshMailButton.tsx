import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { useThreadList } from '@/renderer/app/context/ThreadListContext';
import { cn } from '@/renderer/app/lib/utils';

// Spins at least this long, so a quick check still reads as "checked".
const MIN_SPIN_MS = 600;
// How long the check mark stays after a refresh that went through.
const DONE_MS = 1500;

/**
 * Checks for new mail now. Sits at the end of the tab row, beside Filters:
 * it spins while checking, shows a check mark when done, and new mail slides
 * into the list. The list stays as it is meanwhile (no skeleton).
 */
const RefreshMailButton = () => {
  const { t } = useTranslation();
  const { refresh } = useThreadList();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearTimeout(doneTimerRef.current);
    },
    []
  );

  const onClick = async () => {
    if (state === 'busy') return;
    clearTimeout(doneTimerRef.current);
    setState('busy');
    const [ok] = await Promise.all([
      refresh().catch(() => false),
      new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS))
    ]);
    if (!mountedRef.current) return;
    if (!ok) {
      setState('idle');
      toast.error(
        t('filter.refresh_error', {
          defaultValue: 'Couldn’t check for new mail. Check your connection and try again.'
        })
      );
      return;
    }
    setState('done');
    doneTimerRef.current = setTimeout(() => setState('idle'), DONE_MS);
  };

  const label =
    state === 'busy'
      ? t('filter.refreshing', { defaultValue: 'Checking for new mail…' })
      : state === 'done'
        ? t('filter.refreshed', { defaultValue: 'Up to date' })
        : t('filter.refresh', { defaultValue: 'Check for new mail' });

  return (
    <>
      {/* Says "Up to date" to screen readers: a changed label on the focused
        button isn't reliably read out. */}
      <span role="status" className="sr-only">
        {state === 'done' ? label : ''}
      </span>
      <Button
        variant="ghost"
        sizeVariant="sm"
        tooltip={label}
        aria-label={label}
        aria-busy={state === 'busy'}
        className="flex h-7 w-7 items-center justify-center bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
        onClick={onClick}
      >
        <MonoIcon
          symbol={state === 'done' ? 'check' : 'refresh'}
          size={16}
          className={cn(state === 'busy' && 'animate-spin motion-reduce:animate-pulse')}
        />
      </Button>
    </>
  );
};

export default RefreshMailButton;
