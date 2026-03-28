import { generateUUID } from '@/main/utils';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Textarea } from '@/renderer/app/components/ui/textarea';
import { cn } from '@/renderer/app/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { FC, useEffect, useState, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { AIFilter } from '@/renderer/app/store/filter/useAIFilters';
import { toast } from 'sonner';
import { LABEL_COLORS } from '@/renderer/app/store/label/labelTemplate';

interface AIFilterEditDialogProps {
  children?: React.ReactNode;
  filter: AIFilter | null;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: AIFilter) => Promise<void>;
  accountId?: string; // Add accountId prop to get labels for specific account
}

const AIFilterEditDialog: FC<AIFilterEditDialogProps> = ({
  children,
  filter,
  open,
  onOpenChange,
  onSave,
  accountId = '' // Default to empty string if not provided
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the label hook to get labels and functions
  const { defaultLabels, getAllLabels, getLabelsForAccount, createLabel } = useLabelAtom();

  // Schema for AI Filter with translated error messages
  const aiFilterSchema = useMemo(
    () =>
      z.object({
        id: z.string(),
        name: z.string().min(1, t('settings.filter.validation.name_required')),
        prompt: z.string().min(1, t('settings.filter.validation.prompt_required')),
        outputLabels: z.array(z.string()).min(1, t('settings.filter.validation.label_required')),
        markAsDone: z.boolean().default(false),
        moveToTrash: z.boolean().default(false),
        isActive: z.boolean().optional()
      }),
    [t]
  );

  type AIFilterFormValues = z.infer<typeof aiFilterSchema>;

  // Available inbox actions with translations
  const inboxActions = useMemo(
    () => [
      {
        value: 'keepInInbox',
        label: t('settings.filter.ai.action.keep_in_inbox'),
        icon: 'Inbox' as MonoIconType
      },
      {
        value: 'markAsDone',
        label: t('settings.filter.ai.action.mark_as_done'),
        icon: 'CheckCircle' as MonoIconType
      },
      {
        value: 'moveToTrash',
        label: t('settings.filter.ai.action.move_to_trash'),
        icon: 'Trash' as MonoIconType
      }
    ],
    [t]
  );

  // Use getUniqueCustomLabelNames and process these into labelsList
  // Get appropriate labels based on accountId
  const labelsList = useMemo(() => {
    // If accountId is provided, get labels for that account
    // Otherwise, get all unique custom labels
    const labels = accountId ? getLabelsForAccount(accountId) : getAllLabels();

    // Filter out system labels and format for dropdown
    return labels
      .filter((label) => !defaultLabels.includes(label.id))
      .map((label) => ({
        value: label.id, // Use label ID instead of name
        name: label.name, // Keep name for display purposes
        label: label.name.replace('Mono/', ''), // Remove 'Mono/' prefix for display
        color: label.color || {
          backgroundColor: LABEL_COLORS.GRAY.backgroundColor,
          textColor: LABEL_COLORS.GRAY.textColor
        }
      }));
  }, [accountId, getAllLabels, getLabelsForAccount]);

  // Add a fallback label if no labels are available
  const availableLabels = useMemo(() => {
    return labelsList;
  }, [labelsList]);

  // Function to find label name by ID
  const getLabelNameById = (labelId) => {
    const label = availableLabels.find((label) => label.value === labelId);
    return label ? label.name : null;
  };

  // Function to find label ID by name (for backward compatibility)
  const getLabelIdByName = (labelName) => {
    const label = availableLabels.find((label) => label.name === labelName);
    return label ? label.value : null;
  };

  const getDefaultValues = (): AIFilterFormValues => {
    if (filter) {
      // Convert label names to IDs if they are names (for backward compatibility)
      let outputLabelIds: string[] = [];

      if (Array.isArray(filter.outputLabels)) {
        outputLabelIds = filter.outputLabels
          .map((label) => {
            // Check if this is already an ID or a name
            const isId = availableLabels.some((l) => l.value === label);
            if (isId) {
              return label; // Already an ID
            } else {
              // It's a name, find the corresponding ID
              const labelId = getLabelIdByName(label);
              return labelId || label; // Fall back to the original if ID not found
            }
          })
          .filter(Boolean); // Remove any null/undefined values
      }

      return {
        id: filter.id ?? generateUUID(),
        name: filter.name || '',
        prompt: filter.prompt || '',
        outputLabels: outputLabelIds,
        markAsDone: filter.markAsDone || false,
        moveToTrash: filter.moveToTrash || false,
        isActive: filter.isActive !== undefined ? filter.isActive : true
      };
    }

    // Default values for new filter
    return {
      id: generateUUID(),
      name: '',
      prompt: '',
      outputLabels: [],
      markAsDone: false,
      moveToTrash: false,
      isActive: true
    };
  };

  const form = useForm<AIFilterFormValues>({
    resolver: zodResolver(aiFilterSchema),
    defaultValues: getDefaultValues(),
    mode: 'onChange' // Enable validation on change for real-time feedback
  });

  const { control, handleSubmit, reset, watch, setValue, formState } = form;
  const { errors, isValid } = formState;

  const markAsDone = watch('markAsDone');
  const moveToTrash = watch('moveToTrash');
  const outputLabels = watch('outputLabels');
  const name = watch('name');
  const prompt = watch('prompt');

  // Get the first outputLabel as our "current label"
  const currentOutputLabelId = outputLabels.length > 0 ? outputLabels[0] : null;

  // Check if the selected label exists
  const selectedLabelExists =
    currentOutputLabelId !== null &&
    availableLabels.some((label) => label.value === currentOutputLabelId);

  // Determine if the submit button should be disabled
  const isSubmitDisabled =
    isSubmitting ||
    !name ||
    !prompt ||
    outputLabels.length === 0 ||
    !selectedLabelExists ||
    availableLabels.length === 0;

  useEffect(() => {
    if (open) {
      reset(getDefaultValues());
    }
  }, [filter, reset, open]);

  const onSubmit = async (data: AIFilterFormValues) => {
    try {
      setIsSubmitting(true);
      if (data.outputLabels.length === 0) {
        toast.error(t('toast.error.filter_save'));
        throw Error('No labels found');
      }

      // Additional validation for selected label existence
      const labelExists = data.outputLabels.every((labelId) =>
        availableLabels.some((label) => label.value === labelId)
      );

      if (!labelExists) {
        toast.error(t('toast.error.selected_label_not_exist'));
        throw Error('Selected label does not exist');
      }

      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving AI filter:', error);
      toast.error(t('toast.error.filter_save'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Set inbox action (mutually exclusive)
  const setInboxAction = (action: string) => {
    // Reset all actions
    setValue('markAsDone', false);
    setValue('moveToTrash', false);

    // Set the selected action
    if (action === 'markAsDone') {
      setValue('markAsDone', true);
    } else if (action === 'moveToTrash') {
      setValue('moveToTrash', true);
    }
    // If keepInInbox, both remain false
  };

  // Get current inbox action
  const getCurrentInboxAction = () => {
    if (markAsDone) {
      return inboxActions[1]; // Mark as done
    } else if (moveToTrash) {
      return inboxActions[2]; // Move to trash
    }
    return inboxActions[0]; // Keep in inbox (default)
  };

  // Update the outputLabels array with a single label ID
  const setOutputLabel = (labelId: string) => {
    // Replace the entire array with just this one label ID
    setValue('outputLabels', [labelId], {
      shouldValidate: true, // Trigger validation
      shouldDirty: true // Mark field as changed
    });
  };

  // Find the current label object
  const getCurrentLabelObject = () => {
    // Try to find the label in available labels by ID
    const foundLabel = availableLabels.find((l) => l.value === currentOutputLabelId);

    return foundLabel;
  };

  const currentInboxAction = getCurrentInboxAction();
  const currentLabelObject = getCurrentLabelObject();
  const dialogTitle = filter?.id
    ? t('settings.filter.dialog.title_edit')
    : t('settings.filter.dialog.title_add');

  // Handle creating a new label from template
  const handleCreateTemplateLabel = async () => {
    if (!filter?.templateLabelName || !accountId) return;

    try {
      setIsSubmitting(true);
      const newLabel = await createLabel(
        filter.templateLabelName,
        accountId,
        filter.templateLabelColor
      );

      if (newLabel) {
        // Update the form with the new label ID
        setValue('outputLabels', [newLabel.id], {
          shouldValidate: true,
          shouldDirty: true
        });
      }
    } catch (error) {
      console.error('Error creating label:', error);
      toast.error(t('toast.error.label_create'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="dark:border sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Filter name */}
            <div className="space-y-2">
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState }) => (
                  <>
                    <Input
                      {...field}
                      id="name"
                      className={cn(fieldState.error && 'border-destructive')}
                      placeholder={t('settings.filter.ai.name_placeholder')}
                    />
                    {/* {fieldState.error && (
                      <p className="text-xs text-destructive">{fieldState.error.message}</p>
                    )} */}
                  </>
                )}
              />
            </div>

            {/* If condition section */}
            <div className="space-y-2">
              <div className="text-md">
                <span className="font-medium">{t('settings.filter.ai.condition.if')} </span>
                <span className="text-muted-foreground">
                  {t('settings.filter.ai.condition.description')}
                </span>
              </div>
              <Controller
                control={control}
                name="prompt"
                render={({ field, fieldState }) => (
                  <div className="relative">
                    <Textarea
                      {...field}
                      id="prompt"
                      rows={5}
                      maxLength={1000}
                      className={cn(
                        'h-[280px] max-h-[500px] resize-none p-3 shadow-sm',
                        fieldState.error && 'border-destructive',
                        field.value.length > 900 && 'border-yellow-500', // Warning when close to limit
                        field.value.length >= 1000 && 'border-destructive' // Error at limit
                      )}
                      placeholder={t('settings.filter.ai.prompt_placeholder')}
                    />
                    <div className="absolute right-2 top-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          field.value.length > 900 && 'text-yellow-500',
                          field.value.length >= 1000 && 'text-destructive'
                        )}
                      >
                        {field.value.length}
                      </span>
                      /1000
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Then section - Action buttons */}
            <DialogFooter className="ml-0 w-full sm:justify-between">
              <div className="text-md flex items-center gap-1.5">
                <span className="font-medium">{t('settings.filter.ai.action.then')} </span>
                <span className="text-muted-foreground">
                  {t('settings.filter.ai.action.apply')}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {/* Label Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={availableLabels.length === 0}
                        variant="secondary"
                        type="button"
                      >
                        <MonoIcon
                          type="Label"
                          className="mr-2"
                          style={{ color: currentLabelObject?.color?.backgroundColor }}
                        />
                        {currentLabelObject?.label || t('settings.filter.ai.action.select_label')}
                        <MonoIcon className="ml-2" type="ChevronDown" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="dark">
                      {availableLabels.length > 0 ? (
                        availableLabels.map((label) => (
                          <DropdownMenuItem
                            key={label.value}
                            className="cursor-pointer"
                            onClick={() => setOutputLabel(label.value)}
                          >
                            <MonoIcon
                              type="Label"
                              className="mr-2"
                              style={{ color: label.color?.backgroundColor }}
                            />
                            {label.label}
                            {currentOutputLabelId === label.value && (
                              <MonoIcon type="Check" className="ml-2 h-4 w-4" />
                            )}
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">
                          {t('toast.error.no_label_found')}
                        </div>
                      )}
                      {filter?.templateLabelName && (
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={handleCreateTemplateLabel}
                          disabled={isSubmitting}
                        >
                          <MonoIcon type="Plus" className="mr-2 h-4 w-4" />
                          {isSubmitting ? (
                            <Loader className="mr-2 h-4 w-4" />
                          ) : (
                            t('settings.filter.ai.create_label', 'Create Label')
                          )}
                          : {filter.templateLabelName}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-muted-foreground">
                    {t('settings.filter.ai.action.and')}
                  </span>

                  {/* Inbox Status Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" type="button">
                        <MonoIcon type={currentInboxAction.icon} className="mr-2" />
                        {currentInboxAction.label}
                        <MonoIcon className="ml-2" type="ChevronDown" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="dark">
                      {inboxActions.map((action) => (
                        <DropdownMenuItem
                          key={action.value}
                          className="cursor-pointer"
                          onClick={() => setInboxAction(action.value)}
                        >
                          <MonoIcon type={action.icon} className="mr-2" />
                          {action.label}
                          {(action.value === 'keepInInbox' && !markAsDone && !moveToTrash) ||
                          (action.value === 'markAsDone' && markAsDone) ||
                          (action.value === 'moveToTrash' && moveToTrash) ? (
                            <MonoIcon type="Check" className="ml-2 h-4 w-4" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
              <Button className="ml-auto" type="submit" disabled={isSubmitDisabled}>
                {isSubmitting && <Loader className="mr-2" />}
                {t('settings.buttons.save_changes')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default AIFilterEditDialog;
