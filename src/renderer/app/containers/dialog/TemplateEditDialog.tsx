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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Input } from '@/renderer/app/components/ui/input';
import { Label } from '@/renderer/app/components/ui/label';
import Loader from '@/renderer/app/components/ui/loader';
import { Switch } from '@/renderer/app/components/ui/switch';
import TextEditor from '@/renderer/app/containers/editor/TextEditor';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';
import { cn } from '@/renderer/app/lib/utils';
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

// Updated schema to include icon with random default
const templateSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Template name is required'),
  subject: z.string(),
  body: z.string().min(1, 'Template body is required'), // Added validation for body
  icon: z.string().default(getRandomIcon()) // Random default icon
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface TemplateEditDialogProps {
  children?: React.ReactNode;
  template: TemplateFormValues | null;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: TemplateFormValues) => Promise<void>;
}

const TemplateEditDialog: FC<TemplateEditDialogProps> = ({
  children,
  template,
  open,
  onOpenChange,
  onSave
}) => {
  const { t } = useTranslation();

  // Use local state for hasSubject instead of form state
  const [hasSubject, setHasSubject] = useState(false);
  // Add loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: template || {
      id: generateUUID(),
      name: '',
      subject: '',
      body: '',
      icon: getRandomIcon() // Use random icon here too
    },
    mode: 'onChange' // Enable validation on change for real-time feedback
  });

  const { control, handleSubmit, reset, setValue, watch, formState } = form;
  const { errors, isValid } = formState;

  // Watch the icon value for preview
  const selectedIcon = watch('icon');
  const name = watch('name');
  const body = watch('body');

  // Check if the selected icon exists in available icons
  const iconExists = AVAILABLE_ICONS.includes(selectedIcon as MonoIconType);

  // Determine if the submit button should be disabled
  const isSubmitDisabled = isSubmitting || !name || !body || (hasSubject && !watch('subject'));

  useEffect(() => {
    if (open) {
      reset({
        id: template?.id ?? generateUUID(),
        name: template?.name ?? '',
        subject: template?.subject ?? '',
        body: template?.body ?? '',
        icon: template?.icon ?? getRandomIcon() // Use random icon when form is reset
      });

      // Set hasSubject based on whether the template has a subject
      const templateHasSubject = template && template.subject && template.subject.trim() !== '';
      setHasSubject(templateHasSubject || false);
    }
  }, [template, reset, open]);

  const onSubmit = async (data: TemplateFormValues) => {
    try {
      // Set loading state to true
      setIsSubmitting(true);

      // If hasSubject is false, ensure subject is empty string
      if (!hasSubject) {
        data.subject = '';
      }

      // Call the save function
      await onSave(data);

      // Close the dialog
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving template:', error);
      // Handle error here if needed
    } finally {
      // Reset loading state
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
            <DialogTitle>
              {template?.id
                ? t('settings.template.edit_template')
                : t('settings.template.add_template')}
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
                      <div className="flex items-center space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <div className="flex h-10 w-10 items-center justify-center rounded-md border shadow-sm">
                              <MonoIcon type={field.value as MonoIconType} className="h-5 w-5" />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="max-h-48 w-48 overflow-scroll">
                            {AVAILABLE_ICONS.map((icon) => (
                              <DropdownMenuItem
                                key={icon}
                                onClick={() => field.onChange(icon)}
                                className="flex items-center"
                              >
                                <div className="flex items-center">
                                  <MonoIcon type={icon} className="mr-2 h-4 w-4" />
                                  <span>{icon}</span>
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  />
                </div>
                {/* Template Name Field */}
                <div className="flex-1 space-y-2">
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <span className="mb-[1px] text-sm text-muted-foreground">/</span>
                          </div>
                          <Input
                            {...field}
                            className={cn(
                              'rounded-md pl-6 text-sm',
                              fieldState.error && 'border border-destructive'
                            )}
                            placeholder={t('settings.template.template_shortcut')}
                          />
                        </div>
                      </>
                    )}
                  />
                </div>
              </div>

              {/* Subject toggle using local state */}
              <div className="space-y-2">
                <div className="relative rounded-md border shadow-sm">
                  {/* Only show subject field if hasSubject is true */}
                  {hasSubject && (
                    <div className="border-b px-2">
                      <Controller
                        control={control}
                        name="subject"
                        render={({ field }) => (
                          <Input
                            {...field}
                            variant={'transparent'}
                            placeholder={t('settings.template.subject')}
                          />
                        )}
                      />
                    </div>
                  )}
                  <Controller
                    control={control}
                    name="body"
                    render={({ field, fieldState }) => (
                      <>
                        <TextEditor
                          className="max-h-[300px] min-h-[200px] overflow-scroll"
                          value={field.value || ''}
                          onChange={(value) => setValue('body', value)}
                        />
                      </>
                    )}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <div className="mr-auto flex items-center space-x-2">
                <Switch
                  checked={hasSubject}
                  size={'sm'}
                  onCheckedChange={setHasSubject}
                  id="subject-toggle"
                />
                <Label htmlFor="subject-toggle" className="text-sm">
                  {t('settings.template.include_subject')}
                </Label>
              </div>
              <Button type="submit" disabled={isSubmitDisabled}>
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

export default TemplateEditDialog;
