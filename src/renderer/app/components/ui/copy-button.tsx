import { Button } from '@/renderer/app/components/ui/button';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useState } from 'react';

interface CopyButtonProps {
  textToCopy: string;
  sizeVariant?: 'default' | 'sm' | 'xs' | 'xxs' | 'lg' | 'xl';
  className?: string;
}

export const CopyButton = ({ textToCopy, sizeVariant = 'xs', className }: CopyButtonProps) => {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy).then(
      () => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
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
    >
      <MonoIcon
        className="h-3.5 w-3.5 text-muted-foreground"
        type={copySuccess ? 'Check' : 'Copy'}
      />
    </Button>
  );
};
