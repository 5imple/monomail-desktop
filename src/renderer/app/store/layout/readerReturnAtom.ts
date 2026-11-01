import {
  activeLayoutAtom,
  readerReturnLayoutAtom
} from '@/renderer/app/store/layout/useGlobalAtom';
import { activeThreadIdAtom } from '@/renderer/app/store/thread/atoms';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

/** Watches the reader and, when it closes, goes back to the remembered view. */
export function useReaderReturn() {
  const activeThreadId = useAtomValue(activeThreadIdAtom);
  const returnLayout = useAtomValue(readerReturnLayoutAtom);
  const setReturnLayout = useSetAtom(readerReturnLayoutAtom);
  const setActiveLayout = useSetAtom(activeLayoutAtom);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (activeThreadId) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (returnLayout) {
      setActiveLayout(returnLayout);
      setReturnLayout(null);
    }
  }, [activeThreadId, returnLayout, setActiveLayout, setReturnLayout]);
}

export { readerReturnLayoutAtom };
