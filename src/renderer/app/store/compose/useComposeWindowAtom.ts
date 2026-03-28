import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { atom, useAtom, useSetAtom } from 'jotai';

export const globalDraftWindowsAtom = atom<MonoDraft[]>([]);
export const handleCloseButtonAtom = atom<((onComplete?: () => void) => Promise<void>) | null>(
  null
);

export function useComposeWindowAtom() {
  const [globalDraftWindows, setGlobalDraftWindows] = useAtom(globalDraftWindowsAtom);
  const [handleCloseButton, setHandleCloseButton] = useAtom(handleCloseButtonAtom);

  return {
    globalDraftWindows,
    setGlobalDraftWindows,
    handleCloseButton,
    setHandleCloseButton
  };
}
