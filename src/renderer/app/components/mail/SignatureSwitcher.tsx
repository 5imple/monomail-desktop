import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Label } from '@/renderer/app/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { cn } from '@/renderer/app/lib/utils';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useState } from 'react';
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
    // Reply, forward or new message. Replies and forwards both carry a
    // messageId, so treating messageId as either made every reply also count
    // as a forward (and vice versa) — the two preferences were OR'd. Forwards
    // are told apart by subject ("Fwd:", Outlook's "FW:").
    const subject = draft.subject ?? '';
    const isForward = /^fwd?:/i.test(subject);
    const isReply = !isForward && ((draft.messageId?.length ?? 0) > 0 || /^re:/i.test(subject));
    const isNewMessage = !isReply && !isForward;

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

  // The trigger lives inside the editor's NodeView, so it stays a div/span;
  // Enter / Space open the picker without typing into the editor.
  const openFromKeyboard = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

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
                {signatureValue ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={t('compose.signature.switch', { defaultValue: 'Switch signature' })}
                    onKeyDown={openFromKeyboard}
                    className="mono-signature -m-1 rounded-lg p-1 transition-colors duration-300 hover:bg-muted"
                    dangerouslySetInnerHTML={{ __html: signatureValue }}
                  ></div>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={openFromKeyboard}
                    className="-m-1 rounded-lg p-1 text-muted-foreground transition-colors duration-300 hover:bg-muted"
                  >
                    {t('compose.signature.none', { defaultValue: 'No signature' })}
                  </span>
                )}
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              {t('compose.signature.switch', { defaultValue: 'Switch signature' })}
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Signature selection modal */}
        <PopoverContent align={'start'} alignOffset={0} className="no-drag ml-2 p-0">
          <div className="p-2 pb-0">
            <Label className="">
              {t('compose.signature.title', { defaultValue: 'Signatures' })}
            </Label>
          </div>
          <div className="flex-1 p-1.5">
            <div role="menu" className="space-y-1.5">
              {/* Existing signatures */}
              {signatures.length > 0 ? (
                signatures.map((signature) => {
                  const selected = draft.signatureId === signature.id;
                  return (
                    <button
                      key={signature.id}
                      role="menuitemradio"
                      aria-checked={selected}
                      className={cn(
                        'flex w-full items-center rounded-md p-2 text-left text-sm transition-colors hover:bg-muted-low',
                        ringVariants,
                        selected && 'bg-muted font-medium'
                      )}
                      onClick={() => {
                        setOpen(false);
                        // Picking the current one just closes; "Remove signature"
                        // below is the way to drop it. The short delay lets the
                        // popover exit before TipTap re-renders the node.
                        if (selected) return;
                        setTimeout(() => handleSignatureChange(signature.id), 150);
                      }}
                    >
                      {selected ? (
                        <MonoIcon type={'Check'} className="mr-2" />
                      ) : (
                        <MonoIcon type={signature.icon as MonoIconType} className="mr-2" />
                      )}
                      {signature.name ||
                        t('compose.signature.untitled', { defaultValue: '(Untitled)' })}
                    </button>
                  );
                })
              ) : (
                <div className="p-2 text-start text-sm text-foreground">
                  {t('compose.signature.empty', { defaultValue: 'No custom signatures found' })}
                </div>
              )}
            </div>
          </div>
          <Separator />
          {/* Signature management link */}
          <div className="flex-1 p-1.5">
            <div className="space-y-0">
              <button
                className={cn(
                  'flex w-full items-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted-low',
                  ringVariants
                )}
                onClick={() => {
                  setOpen(false);
                  handleSignatureChange(null);
                }}
              >
                <MonoIcon type={'Trash'} className="mr-2" />
                {t('compose.signature.remove', { defaultValue: 'Remove signature' })}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  electronApi.triggerCommand('OPEN_PREFERENCES_SIGNATURE');
                }}
                className={cn(
                  'flex w-full items-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted-low',
                  ringVariants
                )}
              >
                <MonoIcon type={'Cog'} className="mr-2" />
                {t('compose.signature.manage', { defaultValue: 'Manage signatures' })}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

export default SignatureSwitcher;
