import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { DialogTitle } from '@/renderer/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/renderer/app/components/ui/form';
import Loader from '@/renderer/app/components/ui/loader';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Textarea } from '@/renderer/app/components/ui/textarea';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useNPSAtom, NPSEventType } from '@/renderer/app/store/account/useNPSAtom';
import { zodResolver } from '@hookform/resolvers/zod';
import { FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

const npsFormSchema = z.object({
  score: z.number().min(1).max(10),
  comment: z
    .string()
    .max(500, { message: 'Comment must not be longer than 500 characters.' })
    .optional()
});

type NPSFormValues = z.infer<typeof npsFormSchema>;

interface NPSFormProps {
  onSubmit: (value: NPSFormValues) => void;
  eventType: NPSEventType;
}

interface NumberRatingProps {
  rating: number | null;
  onRatingChange: (rating: number) => void;
}

const NumberRating: FC<NumberRatingProps> = ({ rating, onRatingChange }) => {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {Array.from({ length: 10 }, (_, i) => {
        const value = i + 1;
        const isSelected = rating === value;

        return (
          <Button
            key={value}
            type="button"
            autoFocus
            typeVariant={'icon'}
            variant={'outline'}
            onClick={() => onRatingChange(value)}
            className={` ${isSelected && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'} `}
          >
            {value}
          </Button>
        );
      })}
    </div>
  );
};

const NPSForm: FC<NPSFormProps> = ({ onSubmit, eventType = 'general_feedback' }) => {
  const { member, idToken } = useAuth();
  const { createNPSEntry, submitting } = useNPSAtom();
  const { t } = useTranslation();
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const form = useForm<NPSFormValues>({
    resolver: zodResolver(npsFormSchema),
    mode: 'onChange'
  });

  const handleScoreSelect = (score: number) => {
    setSelectedScore(score);
    form.setValue('score', score);
  };

  const handleSubmit = async (data: NPSFormValues) => {
    try {
      if (!idToken) {
        toast.error(t('toast.error.authentication'));
        return;
      }

      // Score is already in 1-10 scale, no conversion needed
      await createNPSEntry(idToken, {
        score: data.score,
        comment: data.comment,
        eventType: eventType,
        userEmail: member?.email
      });

      onSubmit(data);
    } catch (error) {
      console.error('Error submitting NPS:', error);
      // Error handling is done in the atom
    }
  };

  const getScoreLabel = (score: number) => {
    if (score <= 6) return t('nps.detractor');
    if (score <= 8) return t('nps.passive');
    return t('nps.promoter');
  };

  const getScoreColor = (score: number) => {
    if (score <= 6) return 'text-red-600';
    if (score <= 8) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="">
        <div className="space-y-0.5 p-6">
          <DialogTitle className="text-center">
            {t(`nps.event_type.${'general_feedback'}.title`)}
          </DialogTitle>
          <p className="text-center text-muted-foreground">
            {t(`nps.event_type.${`general_feedback`}.description`, {
              name: member?.displayName?.split(' ')[0] || ''
            })}
          </p>
        </div>

        <div className="flex flex-col gap-6 p-6 pt-0">
          {/* Number Rating Selection */}
          <FormField
            control={form.control}
            name="score"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <div className="space-y-2">
                  <NumberRating rating={selectedScore} onRatingChange={handleScoreSelect} />

                  <div className="mx-9 flex justify-between text-sm text-muted-foreground">
                    <p>{t('nps.not_likely')}</p>
                    <p>{t('nps.extremely_likely')}</p>
                  </div>
                </div>

                <FormMessage />
              </FormItem>
            )}
          />

          {/* Optional Comment */}
          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder={t('nps.comment_placeholder')}
                    className="h-[120px] w-full resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              disabled={selectedScore === null || submitting}
              type="submit"
              className="min-w-[120px]"
            >
              {submitting && <Loader className="mr-2" />}
              {t('nps.submit')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export { NPSForm };
