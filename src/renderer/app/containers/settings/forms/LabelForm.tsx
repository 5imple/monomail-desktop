import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button, buttonVariants } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Input } from '@/renderer/app/components/ui/input';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
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

const ColorPicker = ({
  currentColor,
  onColorChange,
  disabled = false
}: {
  currentColor: LabelColor;
  onColorChange: (color: LabelColor) => void;
  disabled?: boolean;
}) => {
  const colorOptions = Object.entries(LABEL_COLORS).map(([name, value]) => ({
    name: name.toLowerCase().replace('_', ' '),
    value
  }));

  const getColorNameOrDefault = (color: LabelColor) => {
    const foundColor = colorOptions.find(
      (option) => option.value.backgroundColor === color.backgroundColor
    );
    return foundColor?.name || 'Custom';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          sizeVariant="sm"
          type="button"
          typeVariant="icon"
          disabled={disabled}
          className="h-8 justify-center gap-2 px-2"
        >
          <div
            className="h-2 w-2 rounded-full border"
            style={{
              backgroundColor: currentColor.backgroundColor,
              borderColor: currentColor.backgroundColor
            }}
          ></div>
          {/* <MonoIcon type={'Label'} style={{ color: currentColor.backgroundColor }} /> */}
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

  // Set the first account as default when accounts are loaded
  useEffect(() => {
    if (accountUids.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountUids[0]);
    }
  }, [accountUids, selectedAccountId]);

  const { control, handleSubmit, reset, watch, setValue } = useForm<LabelFormValues>({
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

  // Remove a label both locally and in the store
  const handleRemoveLabel = async (index: number, labelId: string, accountId: string) => {
    if (labelId) {
      try {
        await removeLabel(labelId, accountId);
        toast.success(t('toast.preferences.label.removed'));
      } catch (error) {
        console.error('Error removing label:', error);
        toast.error(t('toast.error.label_remove'));
      }
    }
    remove(index);
  };

  // Handle color change for a specific label
  const handleColorChange = (index: number, color: LabelColor) => {
    setValue(`labels.${index}.color`, color);
  };

  const modifiedLabels = useMemo(() => {
    return fields.map((field, index) => {
      const accountLabels = labelsMapByAccount[field.accountId] || {};
      const originalLabel = accountLabels[field.labelId];
      const currentValue = watch(`labels.${index}.name`);
      const currentColor = watch(`labels.${index}.color`);

      return (
        !field.labelId ||
        currentValue !== originalLabel?.name ||
        currentColor.backgroundColor !== originalLabel?.color?.backgroundColor
      );
    });
  }, [fields, watch, labelsMapByAccount]);

  // Submit changes
  const onSubmit = async (data: LabelFormValues) => {
    try {
      // Filter out only the labels that have been modified
      const modifiedLabelsData = data.labels.filter((label, index) => {
        if (!label.labelId) {
          // New labels need to be created
          return true;
        }
        // Check if existing label's name or color has changed
        const accountLabels = labelsMapByAccount[label.accountId] || {};
        const originalLabel = accountLabels[label.labelId];
        return (
          label.name !== originalLabel?.name ||
          label.color.backgroundColor !== originalLabel?.color?.backgroundColor
        );
      });

      // Only process the modified labels
      await Promise.all(
        modifiedLabelsData.map(async (label) => {
          // If labelId is empty, it's a new label
          if (!label.labelId) {
            await createLabel(label.name, label.accountId, label.color);
            toast.success(t('toast.preferences.label.created'));
          } else {
            await updateLabel(label.labelId, label.name, label.accountId, label.color);
            toast.success(t('toast.preferences.label.updated'));
          }
        })
      );

      // Optionally reload labels from the API if you want to ensure fresh data
      await loadLabels();
    } catch (error) {
      console.error('Error updating labels:', error);
      toast.error(t('toast.error.label_update'));
    }
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
                <SelectContent className="dark">
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
              disabled={!selectedAccountId}
            >
              <MonoIcon type="Plus" className="mr-2" />
              {t('settings.label.add_label')}
            </Button>
          </div>
        }
      />

      {!selectedAccountId ? (
        <div className="space-y-6 text-center">
          <span className="mt-10 text-sm text-muted-foreground">Please select an account</span>
        </div>
      ) : fields.length === 0 ? (
        <div className="space-y-6 text-center">
          <span className="mt-10 text-sm text-muted-foreground">
            {t('settings.label.no_labels')}
          </span>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id} className="flex gap-1">
                <Controller
                  control={control}
                  name={`labels.${index}.name`}
                  render={({ field: inputField }) => (
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
                        <Button
                          variant="ghost"
                          typeVariant="icon"
                          type="button"
                          sizeVariant={'sm'}
                          onClick={() =>
                            handleRemoveLabel(index, fields[index].labelId, fields[index].accountId)
                          }
                        >
                          <MonoIcon type="Trash" />
                        </Button>
                      }
                    />
                  )}
                />
              </li>
            ))}
          </ul>
          <Button type="submit">{t('settings.buttons.save_changes')}</Button>
        </>
      )}
    </form>
  );
};
