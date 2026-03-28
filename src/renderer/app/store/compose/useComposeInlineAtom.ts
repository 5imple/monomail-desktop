import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { atom, useAtom, useSetAtom } from 'jotai';

export const inlineDraftsAtom = atom<Record<string, MonoDraft>>({});

export function useComposeInlineAtom() {
  const [inlineDrafts, setInlineDrafts] = useAtom(inlineDraftsAtom);

  const addInlineDraft = (draft: MonoDraft) => {
    if (!draft.messageId) return; // Only add if there's a messageId
    setInlineDrafts((prev) => ({
      ...prev,
      [draft.messageId]: draft
    }));
  };

  const removeInlineDraft = (messageId: string) => {
    setInlineDrafts((prev) => {
      const newMap = { ...prev };
      delete newMap[messageId];
      return newMap;
    });
  };

  const setInlineDraft = (messageId: string, draft: MonoDraft) => {
    setInlineDrafts((prev) => {
      if (!prev[messageId]) return prev; // Do nothing if it doesn't exist
      return {
        ...prev,
        [messageId]: draft
      };
    });
  };

  const clearInlineDrafts = () => {
    setInlineDrafts({});
  };

  return {
    inlineDrafts,
    setInlineDrafts,
    addInlineDraft,
    removeInlineDraft,
    setInlineDraft,
    clearInlineDrafts
  };
}
