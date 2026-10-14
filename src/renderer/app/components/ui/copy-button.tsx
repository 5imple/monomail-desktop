import { Button } from '@/renderer/app/components/ui/button';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface CopyButtonProps {
  textToCopy: string;
  sizeVariant?: 'default' | 'sm' | 'xs' | 'xxs' | 'lg' | 'xl';
  className?: string;
  // Hover label before copying; defaults to "Copy".
  tooltip?: string;
}

export const CopyButton = ({
  textToCopy,
  sizeVariant = 'xs',
  className,
  tooltip
}: CopyButtonProps) => {
  const { t } = useTranslation();
  const [copySuccess, setCopySuccess] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy).then(
      () => {
        setCopySuccess(true);
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopySuccess(false), 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
        toast.error(t('toast.error.copy', 'Couldn’t copy to the clipboard'));
      }
    );
  };

  return (
    <Button
      typeVariant={'icon'}
      variant={'ghost'}
      sizeVariant={sizeVariant}
      onClick={handleCopy}
      className={className}
      // Names the icon-only button, and says "Copied" once it worked (the
      // check icon alone was easy to miss).
      tooltip={copySuccess ? t('common.copied', 'Copied') : (tooltip ?? t('common.copy', 'Copy'))}
    >
      <MonoIcon
        className="h-3.5 w-3.5 text-muted-foreground"
        type={copySuccess ? 'Check' : 'Copy'}
      />
    </Button>
  );
};
