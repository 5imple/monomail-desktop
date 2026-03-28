import feedbackApi from '@/main/api/feedback/feedbackApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { DialogTitle } from '@/renderer/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage
} from '@/renderer/app/components/ui/form';
import Loader from '@/renderer/app/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Textarea } from '@/renderer/app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { zodResolver } from '@hookform/resolvers/zod';
import { FC, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

const feedbackFormSchema = z.object({
  category: z
    .enum(['ui', 'performance', 'bugs_issues', 'feature_requests', 'documentation'])
    .default('bugs_issues'),
  feedback: z
    .string()
    .min(1, { message: 'Feedback must contain content.' })
    .max(1000, { message: 'Feedback must not be longer than 1000 characters.' }),
  files: z.instanceof(FileList).optional()
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

interface SendFeedbackFormProps {
  onSubmit: (value: FeedbackFormValues) => void;
}

const SendFeedbackForm: FC<SendFeedbackFormProps> = ({ onSubmit }) => {
  const { member } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null); // Reference for Textarea
  const [files, setFiles] = useState<File[]>([]);
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [isFormInvalid, setIsFormInvalid] = useState<boolean>(false);
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const categoryOptions = [
    { label: t('dialog.send_feedback.category.bugs_issues'), value: 'bugs_issues' },
    { label: t('dialog.send_feedback.category.feature_requests'), value: 'feature_requests' },
    { label: t('dialog.send_feedback.category.ui'), value: 'ui' },
    { label: t('dialog.send_feedback.category.performance'), value: 'performance' },
    { label: t('dialog.send_feedback.category.documentation'), value: 'documentation' }
  ] as const;

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    mode: 'onChange',
    defaultValues: {
      category: 'bugs_issues'
    }
  });

  const { isValid: isFormValid } = form.formState;

  useEffect(() => {
    const feedbackTextarea = feedbackTextareaRef.current;
    if (feedbackTextarea) {
      setTimeout(() => {
        feedbackTextarea.disabled = false;
        feedbackTextarea.focus();
      }, 0);
    }
  }, [feedbackTextareaRef.current]);

  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (fileList: FileList | null) => {
    if (fileList) {
      const newFiles = Array.from(fileList);
      const validFiles: File[] = [];
      const newInvalidFiles: string[] = [];

      newFiles.forEach((file) => {
        if (file.size <= 5 * 1024 * 1024 && validFiles.length < 10) {
          validFiles.push(file);
        } else {
          newInvalidFiles.push(file.name);
        }
      });

      setFiles((prevFiles) => [...prevFiles, ...validFiles].slice(0, 10));
      setInvalidFiles(newInvalidFiles);

      const dataTransfer = new DataTransfer();
      [...files, ...validFiles].forEach((file) => dataTransfer.items.add(file));
      form.setValue('files', dataTransfer.files);
      setIsFormInvalid(newInvalidFiles.length > 0);
    }
  };

  const handleFileDelete = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);

    const dataTransfer = new DataTransfer();
    newFiles.forEach((file) => dataTransfer.items.add(file));
    form.setValue('files', dataTransfer.files);

    setIsFormInvalid(invalidFiles.length > 0);
  };

  const handleInvalidFileDelete = (index: number) => {
    const newInvalidFiles = invalidFiles.filter((_, i) => i !== index);
    setInvalidFiles(newInvalidFiles);
    setIsFormInvalid(newInvalidFiles.length > 0);
  };

  const handleSubmit = async (data: FeedbackFormValues) => {
    if (!isFormInvalid) {
      setIsLoading(true);
      try {
        const fileArray = files.map((file) => file);
        // FEEDBACK api
        await feedbackApi.postFeedback({
          category: data.category,
          content: data.feedback,
          attachments: fileArray
        });

        toast.success(t('toast.feedback.success'));
        onSubmit(data);
      } catch (error) {
        console.error('Error sending feedback:', error);
        toast.error(t('toast.error.feedback_submit'));
      }
      setIsLoading(false);
    } else {
      toast.error('Please remove invalid attachments before submitting.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="">
        <div className="space-y-0.5 p-6">
          <DialogTitle className="">{t('dialog.send_feedback.title')}</DialogTitle>
          <p className="text-muted-foreground">
            {t('dialog.send_feedback.description')}
            right.
          </p>
        </div>
        <Separator />
        <div className="border-b">
          <FormField
            control={form.control}
            name={`category`}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select defaultValue={field.value}>
                    <SelectTrigger className="border-none p-6 px-7 font-medium">
                      <SelectValue
                        placeholder={t('dialog.send_feedback.select_category')}
                      ></SelectValue>
                    </SelectTrigger>
                    <SelectContent className="dark mx-auto w-[95%]">
                      <SelectGroup className="w-[95%]">
                        {categoryOptions.map((category) => {
                          return (
                            <SelectItem
                              key={category.value}
                              onClick={() => {
                                form.setValue(`category`, category.value);
                              }}
                              value={category.value}
                            >
                              {category.label}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex flex-col gap-2 p-4">
          <FormField
            control={form.control}
            name="feedback"
            render={({ field }) => (
              <FormItem>
                <FormControl ref={feedbackTextareaRef}>
                  <Textarea
                    disabled
                    placeholder={`${t('dialog.send_feedback.placeholder', { name: member ? ` ${member.displayName?.split(' ')[0]}` : '' })}`}
                    className="h-[300px] w-full resize-none border-none text-lg outline-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="">
            <ul className="w-full text-sm">
              {files.map((file, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between rounded-md pl-2 hover:bg-muted-low"
                >
                  <span>{file.name}</span>
                  <Button
                    type={'button'}
                    variant="text"
                    typeVariant={'icon'}
                    onClick={() => handleFileDelete(index)}
                  >
                    <MonoIcon type={'X'} className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>

            <ul className="w-full text-sm">
              {invalidFiles.map((name, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between rounded-md pl-2 hover:bg-muted-low"
                >
                  <div className="flex items-center">
                    <span className="text-muted-foreground">{name}</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <MonoIcon type={'AlertCircle'} className="ml-2 h-4 w-4 text-destructive" />
                      </TooltipTrigger>
                      <TooltipContent>{t('dialog.send_feedback.invalid_file')}</TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    type={'button'}
                    variant="text"
                    typeVariant={'icon'}
                    onClick={() => handleInvalidFileDelete(index)}
                  >
                    <MonoIcon type={'X'} className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <FormField
                  control={form.control}
                  name="files"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileChange(e.target.files)}
                        ref={fileInputRef}
                      />
                      <div
                        className="flex cursor-pointer items-center rounded-md border text-sm"
                        onClick={handleFileInputClick}
                      >
                        <Button variant="ghost">
                          <MonoIcon type={'Paperclip'} className="h-4 w-4" />
                        </Button>
                        {t('dialog.send_feedback.attachments')}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button disabled={!isFormValid || isFormInvalid || isLoading} type="submit">
                {isLoading && <Loader className="mr-2" />}
                {t('dialog.send_feedback.title')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default SendFeedbackForm;
