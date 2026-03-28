import { useMessageLabelAtom } from '@/renderer/app/store/message/useMessageLabels';
import { useMessageOperationAtom } from '@/renderer/app/store/message/useMessageOperationAtom';

export function useMessageAtom() {
  return {
    ...useMessageLabelAtom(),
    ...useMessageOperationAtom()
  };
}
