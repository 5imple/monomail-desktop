import { MonoAccount } from '@/main/api/auth/types';
import { generateUUID } from '@/main/utils';
import { Button } from '@/renderer/app/components/ui/button';
import { Checkbox } from '@/renderer/app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { Input } from '@/renderer/app/components/ui/input';
import { Label } from '@/renderer/app/components/ui/label';
import Loader from '@/renderer/app/components/ui/loader';
import DirectHTMLSignatureEditor from '@/renderer/app/containers/editor/DirectHTMLSignatureEditor';
import { IconPickerButton } from '@/renderer/app/containers/dialog/IconPickerButton';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';
import { cn } from '@/renderer/app/lib/utils';
import { IMonoSignature } from '@/renderer/app/store/compose/useSignatureAtom';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { FC, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Function to get a random icon from the available icons
const getRandomIcon = () => {
  const randomIndex = Math.floor(Math.random() * AVAILABLE_ICONS.length);
  return AVAILABLE_ICONS[randomIndex];
};

// Schema for signature with defaultAccountUids
const signatureSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Signature name is required'),
  content: z.string().min(1, 'Signature content is required'),
  icon: z.string().default(getRandomIcon()),
  defaultAccountUids: z.array(z.string()).default([])
});

type SignatureFormValues = z.infer<typeof signatureSchema>;

interface SignatureEditDialogProps {
  children?: React.ReactNode;
  signature: IMonoSignature | null;
  accounts: MonoAccount[];
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: SignatureFormValues) => Promise<void>;
}

const SignatureEditDialog: FC<SignatureEditDialogProps> = ({
  children,
  signature,
  accounts,
  open,
  onOpenChange,
  onSave
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SignatureFormValues>({
    resolver: zodResolver(signatureSchema),
    defaultValues: signature
      ? {
          id: signature.id,
          name: signature.name,
          content: signature.content,
          icon: signature.icon,
          defaultAccountUids: signature.defaultAccountUids
        }
      : {
          id: generateUUID(),
          name: '',
          content: '',
          icon: getRandomIcon(),
          defaultAccountUids: []
        }
  });

  const { control, handleSubmit, reset, setValue, watch, formState } = form;

  // Watch values for UI updates
  const selectedAccountUids = watch('defaultAccountUids');

  useEffect(() => {
    if (open) {
      reset(
        signature
          ? {
              id: signature.id,
              name: signature.name,
              content: signature.content,
              icon: signature.icon,
              defaultAccountUids: signature.defaultAccountUids
            }
          : {
              id: generateUUID(),
              name: '',
              content: '',
              icon: getRandomIcon(),
              defaultAccountUids: []
            }
      );
    }
  }, [signature, reset, open]);

  const onSubmit = async (data: SignatureFormValues) => {
    try {
      // Set loading state to true
      setIsSubmitting(true);

      // Call the save function
      await onSave(data);

      // Close the dialog
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving signature:', error);
      // Handle error here if needed
    } finally {
      // Reset loading state
      setIsSubmitting(false);
    }
  };

  // Helper to toggle account selection
  const toggleAccount = (accountUid: string, checked: boolean) => {
    const currentSelected = [...selectedAccountUids];

    if (checked && !currentSelected.includes(accountUid)) {
      setValue('defaultAccountUids', [...currentSelected, accountUid]);
    } else if (!checked && currentSelected.includes(accountUid)) {
      setValue(
        'defaultAccountUids',
        currentSelected.filter((uid) => uid !== accountUid)
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent
          className="dark:border sm:max-w-[720px]"
          // Start in the name field. The icon picker came first, opened its
          // tooltip on focus, and that tooltip took the first Escape.
          onOpenAutoFocus={(e) => {
            const name = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>(
              'input[name="name"]'
            );
            if (!name) return;
            e.preventDefault();
            name.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {signature?.id
                ? t('settings.signature.edit_signature')
                : t('settings.signature.add_signature')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="space-y-2">
                  <Controller
                    control={control}
                    name="icon"
                    render={({ field }) => (
                      <IconPickerButton value={field.value} onChange={field.onChange} />
                    )}
                  />
                </div>
                {/* Signature Name Field */}
                <div className="flex-1 space-y-2">
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <>
                        <Input
                          {...field}
                          className={cn(
                            'rounded-md text-sm',
                            fieldState.error && 'border border-destructive'
                          )}
                          placeholder={t('settings.signature.signature_name_placeholder')}
                        />
                        {/* The reason, not only a red border. */}
                        {fieldState.error && (
                          <p className="mt-1 text-xs text-destructive">
                            {fieldState.error.message}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>
              </div>

              {/* Default for accounts section */}

              <div className="space-y-2">
                <Controller
                  control={control}
                  name="content"
                  render={({ field, fieldState }) => (
                    <div>
                      <div
                        className={cn(
                          'rounded-md border shadow-sm',
                          fieldState.error && 'border-destructive'
                        )}
                      >
                        {/* overflow-auto: overflow-scroll drew empty scrollbar
                            tracks, and wide signatures still need to scroll. */}
                        <DirectHTMLSignatureEditor
                          className={cn(
                            'mono-signature max-h-[300px] min-h-[200px] overflow-auto rounded-md'
                          )}
                          value={field.value || ''}
                          // Revalidated once a save was tried, so the error
                          // clears as you type (never on the editor's first
                          // onChange when the dialog opens).
                          onChange={(value) =>
                            setValue('content', value, {
                              shouldDirty: true,
                              shouldValidate: formState.isSubmitted
                            })
                          }
                        />
                      </div>
                      {fieldState.error && (
                        <p className="mt-1 text-xs text-destructive">{fieldState.error.message}</p>
                      )}
                    </div>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('settings.signature.default_for_accounts')}</Label>
                <div className="rounded-md border p-3 shadow-sm">
                  <div className="grid gap-2">
                    <Controller
                      control={control}
                      name="defaultAccountUids"
                      render={({ field }) => (
                        <>
                          {accounts.map((account) => (
                            <div key={account.uid} className="flex items-center space-x-2">
                              <Checkbox
                                id={`account-${account.uid}`}
                                checked={field.value.includes(account.uid)}
                                onCheckedChange={(checked) =>
                                  toggleAccount(account.uid, checked as boolean)
                                }
                              />
                              <Label
                                htmlFor={`account-${account.uid}`}
                                className="cursor-pointer text-sm"
                              >
                                {account.email || account.displayName || account.uid}
                              </Label>
                            </div>
                          ))}
                        </>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader className="mr-2" />}
                {signature?.id ? t('settings.buttons.save_changes') : t('settings.buttons.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default SignatureEditDialog;
