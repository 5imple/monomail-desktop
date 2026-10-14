import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle
} from '@/renderer/app/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Input } from '@/renderer/app/components/ui/input';
import {
  SettingsChangeDot,
  SettingsPageHeader
} from '@/renderer/app/containers/settings/SettingsPageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { LABEL_COLORS, LabelColor } from '@/renderer/app/store/label/labelTemplate';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type LabelFormValues = {
  labels: {
    labelId: string;
    name: string;
    accountId: string;
    color: LabelColor;
  }[];
};

type LabelRow = LabelFormValues['labels'][number];
type StoredLabel = { name?: string; color?: { backgroundColor?: string } } | undefined;

// A row differs from what's saved: new, renamed or recolored. An uncolored
// label shows as gray (see the reset effect), so gray is its saved color too;
// otherwise every uncolored label counted as changed.
const isLabelModified = (label: LabelRow, original: StoredLabel) =>
  !label.labelId ||
  label.name !== original?.name ||
  label.color.backgroundColor !==
    (original?.color?.backgroundColor ?? LABEL_COLORS.GRAY.backgroundColor);

const ColorPicker = ({
  currentColor,
  onColorChange,
  disabled = false
}: {
  currentColor: LabelColor;
  onColorChange: (color: LabelColor) => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  const colorOptions = Object.entries(LABEL_COLORS).map(([name, value]) => ({
    name: name.toLowerCase().replace(/_/g, ' '),
    value
  }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          sizeVariant="sm"
          type="button"
          typeVariant="icon"
          disabled={disabled}
          // Named (it was a bare 8px dot) and big enough to see.
          tooltip={t('settings.label.color', 'Label color')}
          className="h-8 justify-center gap-2 px-2"
        >
          <div
            className="h-3 w-3 rounded-full border"
            style={{
              backgroundColor: currentColor.backgroundColor,
              borderColor: currentColor.backgroundColor
            }}
          ></div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {colorOptions.map((color) => (
            <DropdownMenuCheckboxItem
              key={color.name}
              checked={currentColor.backgroundColor === color.value.backgroundColor}
              onClick={() => onColorChange(color.value)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex aspect-square h-5 w-5 items-center justify-center rounded-sm border"
                  style={{
                    backgroundColor: color.value.backgroundColor,
                    borderColor: `${color.value.textColor}50`
                  }}
                >
                  <span className="text-xs" style={{ color: color.value.textColor }}>
                    A
                  </span>
                </div>
                <span className="capitalize">{color.name}</span>
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const LabelForm = () => {
  const { labelsMapByAccount, loadLabels, createLabel, updateLabel, removeLabel } = useLabelAtom();
  const { getAccountByUid, accounts } = useAuth();
  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0].uid ?? '');
  // The saved label waiting on the delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<{
    labelId: string;
    accountId: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Get account IDs from accounts
  const accountUids = useMemo(() => accounts.map((account) => account.uid), [accounts]);

  // Create a map of account IDs to account emails for display
  const accountEmailMap = useMemo(() => {
    const emailMap: Record<string, string> = {};
    accounts.forEach((account) => {
      emailMap[account.uid] = account?.email || account.uid;
    });
    return emailMap;
  }, [accounts]);

  // Labels are Gmail's: a Microsoft 365 account has none to list, and adding
  // one sent Gmail API calls for it.
  const labelsSupported = getAccountByUid(selectedAccountId)?.provider === 'google';

  // Set the first account as default when accounts are loaded
  useEffect(() => {
    if (accountUids.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountUids[0]);
    }
  }, [accountUids, selectedAccountId]);

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<LabelFormValues>({
    defaultValues: {
      labels: [] // Start empty; we'll populate on mount below
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'labels'
  });

  // Whenever selected account's labelsMap changes, reset the form
  useEffect(() => {
    if (!selectedAccountId) return;

    const accountLabels = labelsMapByAccount[selectedAccountId] || {};
    const labelArray = Object.entries(accountLabels)
      .filter(([id]) => id.startsWith('Label_'))
      .map(([id, label]) => ({
        labelId: id,
        name: label.name,
        accountId: selectedAccountId,
        color: label.color || {
          backgroundColor: LABEL_COLORS.GRAY.backgroundColor,
          textColor: LABEL_COLORS.GRAY.textColor
        }
      }));

    reset({ labels: labelArray });
  }, [labelsMapByAccount, selectedAccountId, reset]);

  // Add a new label row (with no ID yet)
  const handleAddLabel = () => {
    if (!selectedAccountId) {
      toast.error(t('toast.error.select_account'));
      return;
    }
    append({
      labelId: '',
      name: '',
      accountId: selectedAccountId,
      color: {
        backgroundColor: LABEL_COLORS.BLACK.backgroundColor,
        textColor: LABEL_COLORS.BLACK.textColor
      }
    });
  };

  // A row not saved yet just goes. A saved label is deleted from the mail
  // account after a confirmation, and its row then leaves with the store
  // update: removing it here as well took out the row that had moved up into
  // its place.
  const handleRemoveLabel = (index: number, labelId: string, accountId: string, name: string) => {
    if (!labelId) {
      remove(index);
      return;
    }
    setPendingDelete({ labelId, accountId, name });
  };

  const confirmRemoveLabel = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await removeLabel(pendingDelete.labelId, pendingDelete.accountId);
      toast.success(t('toast.preferences.label.removed'));
    } catch (error) {
      console.error('Error removing label:', error);
      // Keep the row: the label still exists on the server.
      toast.error(t('toast.error.label_remove'));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  // Handle color change for a specific label
  const handleColorChange = (index: number, color: LabelColor) => {
    setValue(`labels.${index}.color`, color);
  };

  // Read during render so the dots and Save follow every edit (the old memo
  // depended on the stable watch function and went stale).
  const watchedLabels = watch('labels') ?? [];
  const modified = watchedLabels.map((label) =>
    isLabelModified(label, labelsMapByAccount[label.accountId]?.[label.labelId])
  );
  const hasChanges = modified.some(Boolean);

  // Submit changes
  const onSubmit = async (data: LabelFormValues) => {
    // Filter out only the labels that have been modified, names trimmed (an
    // empty name is stopped by the field's validation before this runs)
    const modifiedLabelsData = data.labels
      .filter((label) =>
        isLabelModified(label, labelsMapByAccount[label.accountId]?.[label.labelId])
      )
      .map((label) => ({ ...label, name: label.name.trim() }));
    if (modifiedLabelsData.length === 0) return;

    let failed = 0;
    try {
      const results = await Promise.allSettled(
        modifiedLabelsData.map((label) =>
          // If labelId is empty, it's a new label
          label.labelId
            ? updateLabel(label.labelId, label.name, label.accountId, label.color)
            : createLabel(label.name, label.accountId, label.color)
        )
      );
      results.forEach((result) => {
        if (result.status === 'rejected') {
          failed++;
          console.error('Error updating labels:', result.reason);
        }
      });
    } finally {
      // Reload from the server whatever happened, so a partial failure (or two
      // creates overwriting each other's local copy) doesn't leave the list stale.
      await loadLabels(accounts.map((a) => a.uid));
    }

    // One toast for the save, not one per label.
    if (failed > 0) toast.error(t('toast.error.label_update'));
    else toast.success(t('settings.label.saved', 'Labels saved'));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <SettingsPageHeader
        title={t('settings.label.title')}
        description={t('settings.label.description')}
        action={
          <div className="flex gap-2">
            {accountUids.length > 0 && (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger variant={'secondary'} className="">
                  <SelectValue
                    placeholder="Select Account"
                    className={cn(buttonVariants({ variant: 'secondary' }))}
                  />
                </SelectTrigger>
                <SelectContent>
                  {accountUids.map((accountId) => (
                    <SelectItem key={accountId} value={accountId}>
                      {accountEmailMap[accountId]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="secondary"
              onClick={handleAddLabel}
              type="button"
              disabled={!selectedAccountId || !labelsSupported}
            >
              <MonoIcon type="Plus" className="mr-2" />
              {t('settings.label.add_label')}
            </Button>
          </div>
        }
      />

      {!selectedAccountId ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">
          {t('settings.label.select_account', 'Please select an account')}
        </p>
      ) : !labelsSupported ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {t(
            'settings.label.unsupported_provider',
            "Labels aren't available for Microsoft 365 accounts yet."
          )}
        </div>
      ) : fields.length === 0 ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">
          {t('settings.label.no_labels')}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id}>
                <Controller
                  control={control}
                  name={`labels.${index}.name`}
                  // A label needs a name; an empty one is flagged here rather
                  // than sent.
                  rules={{
                    validate: (value) =>
                      !!value.trim() || t('settings.label.name_required', 'Give the label a name')
                  }}
                  render={({ field: inputField, fieldState }) => (
                    <>
                      <Input
                        elementsPosition={'inside'}
                        prepend={
                          <ColorPicker
                            currentColor={watch(`labels.${index}.color`)}
                            onColorChange={(color) => handleColorChange(index, color)}
                            disabled={!selectedAccountId}
                          />
                        }
                        variant={'default'}
                        {...inputField}
                        placeholder={t('settings.label.label_name')}
                        append={
                          <div className="flex items-center gap-1">
                            {modified[index] && <SettingsChangeDot />}
                            <Button
                              variant="ghost"
                              typeVariant="icon"
                              type="button"
                              sizeVariant={'sm'}
                              tooltip={t('settings.label.delete', {
                                defaultValue: 'Delete label'
                              })}
                              onClick={() =>
                                handleRemoveLabel(
                                  index,
                                  fields[index].labelId,
                                  fields[index].accountId,
                                  watchedLabels[index]?.name ?? ''
                                )
                              }
                            >
                              <MonoIcon type="Trash" />
                            </Button>
                          </div>
                        }
                      />
                      {fieldState.error?.message && (
                        <p className="mt-1 text-xs text-destructive">{fieldState.error.message}</p>
                      )}
                    </>
                  )}
                />
              </li>
            ))}
          </ul>
          <Button type="submit" disabled={!hasChanges || formState.isSubmitting}>
            {formState.isSubmitting
              ? t('settings.buttons.saving', 'Saving…')
              : t('settings.buttons.save_changes')}
          </Button>
        </>
      )}

      {/* The app's own confirmation (it was a native window.confirm). */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className="dark" />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                {t('settings.label.delete', { defaultValue: 'Delete label' })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('settings.label.confirm_delete', {
                  name: pendingDelete?.name ?? '',
                  defaultValue: 'Delete the label "{{name}}"? Emails keep their other labels.'
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t('settings.buttons.cancel')}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void confirmRemoveLabel()}
              >
                {deleting && (
                  <MonoIcon type="Loader2" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t('settings.buttons.delete')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </form>
  );
};
