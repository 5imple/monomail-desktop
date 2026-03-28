import signatureApi from '@/main/api/signature/signatureApi';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import SignatureEditDialog from '@/renderer/app/containers/dialog/SignatureEditDialog';
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
  const { preference, user, accounts } = useAuth();

  const openAddDialog = () => {
    setSelectedSignature(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (signature: IMonoSignature) => {
    setSelectedSignature(signature);
    setIsDialogOpen(true);
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

        // TODO
        await signatureApi.updateSignature(signatureData);
        updateSignatureById(data.id, signatureData);

        // Update other signatures to remove default status for the accounts
        // that are now default for this signature
        for (const accountUid of data.defaultAccountUids) {
          signatures.forEach((s) => {
            if (s.id !== data.id && s.defaultAccountUids.includes(accountUid)) {
              const updatedDefaultAccounts = s.defaultAccountUids.filter(
                (uid) => uid !== accountUid
              );
              updateSignatureById(s.id, { ...s, defaultAccountUids: updatedDefaultAccounts });

              // Update in API
              signatureApi.updateSignature({
                ...s,
                defaultAccountUids: updatedDefaultAccounts
              });
            }
          });
        }

        toast.success(t('Signature updated'));
      } else {
        // Add new signature
        trackEvent('signature_add', {
          includesVariable: data.content.includes('{') && data.content.includes('}')
        });

        await signatureApi.addSignature(signatureData);
        addSignature(signatureData);

        // Update other signatures to remove default status for the accounts
        // that are now default for this signature
        for (const accountUid of data.defaultAccountUids) {
          signatures.forEach((s) => {
            if (s.defaultAccountUids.includes(accountUid)) {
              const updatedDefaultAccounts = s.defaultAccountUids.filter(
                (uid) => uid !== accountUid
              );
              updateSignatureById(s.id, { ...s, defaultAccountUids: updatedDefaultAccounts });

              // Update in API
              signatureApi.updateSignature({
                ...s,
                defaultAccountUids: updatedDefaultAccounts
              });
            }
          });
        }

        toast.success(t('Signature created'));
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      toast.error(t('settings.signature.signature_save_error'));
    }
  };

  const handleDeleteSignature = async (id: string) => {
    try {
      await signatureApi.deleteSignature(id);
      removeSignatureById(id);
      toast.success(t('settings.signature.signature_deleted'));
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast.error(t('settings.signature.signature_delete_error'));
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="mb-4 flex items-start">
          <div>
            <h3 className="text-lg font-medium">{t('settings.signature.title')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.signature.description')}</p>
          </div>
          <Button className="ml-auto" variant="secondary" onClick={openAddDialog} type="button">
            <MonoIcon type="Plus" className="mr-2" />
            {t('settings.signature.add_signature')}
          </Button>
        </div>
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

                {/* Default accounts info */}
                <div className="basis-32 px-2 text-right">
                  {signature.defaultAccountUids.length > 0 && (
                    <div className="flex items-center justify-end">
                      <div className="mr-2 h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm">{signature.defaultAccountUids.length}</span>
                    </div>
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
                      >
                        <MonoIcon type="MoreHorizontal" className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(signature)}>
                        <MonoIcon type="Edit" className="mr-2 h-4 w-4" />
                        <span>{t('settings.signature.edit_signature')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onClick={() => handleDeleteSignature(signature.id)}
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
