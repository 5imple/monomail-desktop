import signatureApi from '@/main/api/signature/signatureApi';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import SignatureEditDialog from '@/renderer/app/containers/dialog/SignatureEditDialog';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { getPlainTextSnippet } from '@/renderer/app/lib/getPlainTextSnippet';
import { cn } from '@/renderer/app/lib/utils';
import { IMonoSignature, useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const SignatureTable = () => {
  const { signatures, addSignature, removeSignatureById, updateSignatureById } = useSignatureAtom();
  const { trackEvent } = useUserTrackingData();
  const { t } = useTranslation();
  const [selectedSignature, setSelectedSignature] = useState<IMonoSignature | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { accounts } = useAuth();

  const openAddDialog = () => {
    setSelectedSignature(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (signature: IMonoSignature) => {
    setSelectedSignature(signature);
    setIsDialogOpen(true);
  };

  // The accounts a saved signature is now default for are no longer default on
  // any other signature. Worked out once per signature: looping per account
  // over the render-time list restored a removed default, leaving two
  // signatures default for the same account.
  const releaseDefaults = async (savedId: string, claimedUids: string[]) => {
    for (const other of signatures) {
      if (other.id === savedId) continue;
      const remaining = other.defaultAccountUids.filter((uid) => !claimedUids.includes(uid));
      if (remaining.length === other.defaultAccountUids.length) continue;
      updateSignatureById(other.id, { defaultAccountUids: remaining });
      await signatureApi.updateSignature({ ...other, defaultAccountUids: remaining });
    }
  };

  const handleSaveSignature = async (data: {
    id: string;
    name: string;
    content: string;
    icon: string;
    defaultAccountUids: string[];
  }) => {
    try {
      // Create or update signature with the selected default accounts
      const signatureData: IMonoSignature = {
        id: data.id,
        name: data.name,
        content: data.content,
        icon: data.icon,
        defaultAccountUids: data.defaultAccountUids
      };

      if (data.id && signatures.some((s) => s.id === data.id)) {
        // Update existing signature
        trackEvent('signature_update', {
          includesVariable: data.content.includes('{') && data.content.includes('}')
        });

        await signatureApi.updateSignature(signatureData);
        updateSignatureById(data.id, signatureData);

        await releaseDefaults(data.id, data.defaultAccountUids);

        toast.success(t('settings.signature.signature_updated'));
      } else {
        // Add new signature
        trackEvent('signature_add', {
          includesVariable: data.content.includes('{') && data.content.includes('}')
        });

        await signatureApi.addSignature(signatureData);
        addSignature(signatureData);

        await releaseDefaults(data.id, data.defaultAccountUids);

        toast.success(t('settings.signature.signature_added'));
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      toast.error(t('settings.signature.signature_save_error'));
      // Rethrown so the editor stays open with what was typed (it closed and
      // lost it).
      throw error;
    }
  };

  // Deleting is instant, with Undo in the toast (signatures are local, so
  // putting one back is cheap). It used to be gone on the first click.
  const handleDeleteSignature = async (signature: IMonoSignature) => {
    try {
      await signatureApi.deleteSignature(signature.id);
      removeSignatureById(signature.id);
      const defaults = signature.defaultAccountUids.length;
      toast.success(t('settings.signature.signature_deleted'), {
        description:
          defaults > 0
            ? t('settings.signature.deleted_default', {
                count: defaults,
                defaultValue: 'It was the default signature for {{count}} account(s).'
              })
            : undefined,
        action: {
          label: t('toast.undo'),
          onClick: async () => {
            try {
              await signatureApi.addSignature(signature);
              addSignature(signature);
            } catch (error) {
              console.error('Error restoring signature:', error);
              toast.error(t('settings.signature.signature_save_error'));
            }
          }
        }
      });
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast.error(t('settings.signature.signature_delete_error'));
    }
  };

  return (
    <>
      <div className="space-y-8">
        <SettingsPageHeader
          title={t('settings.signature.title')}
          description={t('settings.signature.description')}
          action={
            <Button variant="secondary" onClick={openAddDialog} type="button">
              <MonoIcon type="Plus" className="mr-2" />
              {t('settings.signature.add_signature')}
            </Button>
          }
        />
        <div className="overflow-hidden rounded-md border shadow-sm">
          <div className="flex gap-1 border-b bg-muted px-2 py-2">
            <div className="ml-2 basis-14 text-sm text-muted-foreground">
              {t('settings.signature.icon')}
            </div>
            <div className="basis-32 text-sm text-muted-foreground">
              {t('settings.signature.signature_name')}
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              {t('settings.signature.content')}
            </div>
            <div className="basis-32 px-2 text-right text-sm text-muted-foreground">
              {t('settings.signature.default')}
            </div>
            <div className="w-8 shrink-0" />
          </div>
          {signatures.length === 0 ? (
            <div className="p-2.5 text-center text-sm text-muted-foreground">
              {t('settings.signature.no_signatures')}
            </div>
          ) : (
            signatures.map((signature) => (
              <div
                key={signature.id}
                className="flex items-center gap-1 overflow-hidden border-b p-2 py-1 last:border-0"
              >
                {/* The row opens the editor (it took the small "…" menu). */}
                <button
                  type="button"
                  onClick={() => openEditDialog(signature)}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Icon column */}
                  <div
                    className={cn('mx-3 flex basis-10 items-center justify-start text-primary/80')}
                  >
                    {signature.icon && <MonoIcon type={signature.icon as MonoIconType} />}
                  </div>

                  <div className="basis-32 overflow-hidden text-ellipsis text-sm">
                    <span className="whitespace-nowrap">{signature.name}</span>
                  </div>

                  <div className="flex-1 overflow-hidden text-ellipsis">
                    <span className="line-clamp-1 text-sm text-muted-foreground">
                      {getPlainTextSnippet(signature.content) || t('settings.signature.no_content')}
                    </span>
                  </div>
                </button>

                {/* Default accounts, in words (it was a dot and a number) */}
                <div className="basis-32 px-2 text-right">
                  {signature.defaultAccountUids.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="text-xs text-muted-foreground">
                          {signature.defaultAccountUids.length === 1
                            ? t('settings.signature.default')
                            : t('settings.signature.multiple_defaults', {
                                count: signature.defaultAccountUids.length
                              })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {signature.defaultAccountUids
                          .map((uid) => accounts.find((account) => account.uid === uid)?.email)
                          .filter(Boolean)
                          .join(', ')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <div className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        sizeVariant="sm"
                        typeVariant="icon"
                        className="h-8 w-8 p-0"
                        aria-label={t('settings.signature.actions_for', {
                          name: signature.name,
                          defaultValue: 'Actions for {{name}}'
                        })}
                      >
                        <MonoIcon type="MoreHorizontal" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(signature)}>
                        <MonoIcon type="Edit" className="mr-2 h-4 w-4" />
                        <span>{t('settings.signature.edit_signature')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onClick={() => handleDeleteSignature(signature)}
                        // disabled={signature.defaultAccountUids.length > 0}
                      >
                        <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
                        <span>{t('settings.signature.remove_signature')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <SignatureEditDialog
        signature={selectedSignature}
        accounts={accounts || []}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveSignature}
      />
    </>
  );
};

export default SignatureTable;
