import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Label } from '@/renderer/app/components/ui/label';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger
} from '@/renderer/app/components/ui/popover';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
// useBillingAtom removed — payment-free build.
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SignatureSwitcher = ({
  draft,
  onSignatureChange
}: {
  draft: MonoDraft;
  onSignatureChange?: (signatureId: string | null) => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { signatures, getDefaultSignature, getSignatureById } = useSignatureAtom();
  const { getUidFromEmail, preference } = useAuth();

  const [signatureValue, setSignatureValue] = useState<string>();
  const [shouldShowSignature, setShouldShowSignature] = useState<boolean>(false);

  useEffect(() => {
    // Determine if the message is a reply, forward, or new message
    // More reliable detection based on draft properties and subject
    const isReply =
      draft.subject?.toLowerCase().startsWith('re: ') || draft.messageId.length > 0 || false; // Reply has messageId, threadId, and recipients

    const isForward =
      draft.subject?.toLowerCase().startsWith('fwd: ') || draft.messageId.length > 0 || false; // Forward has messageId, threadId, but no recipients initially

    const isNewMessage = !isReply && !isForward && !draft.messageId;

    // Check user's signature inclusion preferences
    const shouldIncludeSignature =
      (isNewMessage && preference.signature?.includeInNewMessages) ||
      (isReply && preference.signature?.includeInReplies) ||
      (isForward && preference.signature?.includeInForwards);

    // Set visibility state
    setShouldShowSignature(shouldIncludeSignature);

    // If signature should be shown, determine which signature to display
    if (shouldIncludeSignature) {
      const uid = getUidFromEmail(draft.from);

      if (uid) {
        // Try to get signature from draft signatureId first, then fall back to default
        const signature = draft.signatureId
          ? getSignatureById(draft.signatureId)
          : getDefaultSignature(uid);

        // Check if user has default "Sent with Mono" signature enabled
        if (signature) {
          // Custom signature
          setSignatureValue(signature.content);

          onSignatureChange?.(signature.id);
        }
      }
    }
  }, [draft.from, signatures, draft.messageId, draft.threadId, preference.signature]);

  const handleSignatureChange = (signatureId: string | null) => {
    if (signatureId) {
      const signature = getSignatureById(signatureId);
      if (signature) {
        setSignatureValue(signature.content);
        onSignatureChange?.(signatureId);
      }
    } else {
      setSignatureValue(undefined);
      onSignatureChange?.(null);
    }
  };

  // If we shouldn't show a signature based on preferences, return null
  if (!shouldShowSignature) {
    return null;
  }

  return (
    <NodeViewWrapper contentEditable={false} className="group flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        {/* Button and signature shown in editor */}
        <div className="group flex w-full flex-grow cursor-auto items-start">
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                {/* <Button
              // disabled={!billingInfo.subscription}
              className="-ml-4 mt-1 cursor-pointer text-sm opacity-0 hover:opacity-100 group-hover:opacity-100"
              variant="ghost"
              typeVariant={'inline'}
            >
              <MonoIcon type={'ChevronDown'} />
            </Button> */}
                {signatureValue ? (
                  <div
                    className="mono-signature -m-1 rounded-lg p-1 transition-colors duration-300 hover:bg-muted"
                    dangerouslySetInnerHTML={{ __html: signatureValue }}
                  ></div>
                ) : (
                  <span className="-m-1 rounded-lg p-1 text-muted-foreground transition-colors duration-300 hover:bg-muted">
                    No signature
                  </span>
                )}
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Switch signature</TooltipContent>
          </Tooltip>
        </div>
        {/* Signature selection modal */}
        <PopoverContent align={'start'} alignOffset={0} className="no-drag dark ml-2 p-0">
          <div className="p-2 pb-0">
            <Label className="">Signatures</Label>
          </div>
          <div className="flex-1 p-1.5">
            <ul className="space-y-1.5">
              {/* Existing signatures */}
              {signatures.length > 0 ? (
                signatures.map((signature) => (
                  <li
                    key={signature.id}
                    className={cn(
                      'flex items-center rounded-md p-2 text-sm transition-colors hover:bg-muted-low',
                      draft.signatureId === signature.id && 'bg-muted-low'
                    )}
                    onClick={() => {
                      setOpen(false);
                      setTimeout(() => {
                        if (draft.signatureId === signature.id) {
                          handleSignatureChange(null);
                        } else {
                          handleSignatureChange(signature.id);
                        }
                      }, 150);
                    }}
                  >
                    {draft.signatureId === signature.id ? (
                      <MonoIcon type={'Check'} className="mr-2" />
                    ) : (
                      <MonoIcon type={signature.icon as MonoIconType} className="mr-2" />
                    )}
                    {signature.name || '(Untitled)'}
                  </li>
                ))
              ) : (
                <li className="p-2">
                  <div className="text-start text-sm text-foreground">
                    No custom signatures found
                  </div>
                </li>
              )}
            </ul>
          </div>
          <Separator />
          {/* Signature management link */}
          <div className="flex-1 p-1.5">
            <ul className="space-y-0">
              <button
                className="flex w-full items-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted-low"
                onClick={() => {
                  setOpen(false);
                  handleSignatureChange(null);
                }}
              >
                <MonoIcon type={'Trash'} className="mr-2" />
                Remove signature
              </button>
              <button
                onClick={() => {
                  electronApi.triggerCommand('OPEN_PREFERENCES_SIGNATURE');
                }}
                className="flex w-full items-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted-low"
              >
                <MonoIcon type={'Cog'} className="mr-2" />
                Manage signatures
              </button>
            </ul>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

export default SignatureSwitcher;
