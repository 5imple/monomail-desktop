import { useEffect, useRef, useState } from 'react';

export type ThreadReadMotion = 'to-read' | 'to-unread' | null;

export function useThreadReadMotion(threadId: string, isUnread: boolean | null | undefined) {
  const previousStateRef = useRef<{ threadId: string; isUnread: boolean } | null>(null);
  const [motion, setMotion] = useState<ThreadReadMotion>(null);

  useEffect(() => {
    if (typeof isUnread !== 'boolean') {
      previousStateRef.current = null;
      setMotion(null);
      return;
    }

    const previousState = previousStateRef.current;

    if (!previousState || previousState.threadId !== threadId) {
      previousStateRef.current = { threadId, isUnread };
      setMotion(null);
      return;
    }

    if (previousState.isUnread === isUnread) return;

    previousStateRef.current = { threadId, isUnread };
    setMotion(isUnread ? 'to-unread' : 'to-read');

    const timeout = window.setTimeout(() => setMotion(null), 680);
    return () => window.clearTimeout(timeout);
  }, [isUnread, threadId]);

  return motion;
}
