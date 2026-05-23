import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import { MonoAttachment } from '@/main/models/types';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { getAttachmentIcon } from '@/renderer/app/lib/getAttachmentIcon';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useTranslation } from 'react-i18next';

import { FC, useState } from 'react';
import { toast } from 'sonner';

interface AttachmentItemProps {
  source: 'draft' | 'message';
  itemId: string;
  attachment: MonoAttachment;
  accountId: string;
  preview?: boolean;
  size?: 'default' | 'xs' | 'sm' | 'lg' | null | undefined;
  children?: React.ReactNode;
  disabled?: boolean;
  tabIndex?: number;
}

const AttachmentItem: FC<AttachmentItemProps> = ({
  source = 'message',
  preview = false,
  itemId,
  accountId,
  attachment,
  size = 'sm',
  children,
  disabled,
  tabIndex
}) => {
  const { openDialog } = useDialogs();
  const [isDownloading, setIsDownloading] = useState(false);
  const { t } = useTranslation();

  const handlePreview = async () => {
    try {
      openDialog('attachmentPreview', { accountId, source, itemId, attachment });
    } catch (e) {
      console.error(e);
      toast.error(t('toast.error.attachment_download'));
    }
  };

  const downloadAttachment = async () => {
    try {
      setIsDownloading(true);

      // Fetch the Blob data from the API
      let response: Blob | null = null;
      if (source === 'message') {
        response = await mailApi.getAttachmentDownload(
          accountId,
          itemId,
          attachment.attachmentId,
          attachment.fileName
        );
      } else if (source === 'draft') {
        response = await draftApi.getAttachmentDownload(accountId, attachment.attachmentId);
      }

      if (!response) return;
      // Create a URL from the Blob
      const blobUrl = URL.createObjectURL(response);

      // Create an anchor element to trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName; // Set the filename
      document.body.appendChild(a);
      a.click();

      // Remove the anchor element after download
      document.body.removeChild(a);

      // Release memory
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast.error(t('toast.error.attachment_download'));
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <Button
      variant={'secondary'}
      sizeVariant={size}
      onClick={preview ? handlePreview : downloadAttachment}
      className={cn(
        // Newton attachment chip (button variant for inline-flow use):
        // icon tile on the left, file name + mono size stacked on the right.
        'group flex w-fit items-center gap-3 rounded-md border border-border/60 bg-card px-3 py-2 shadow-sm transition-colors hover:border-border hover:bg-muted/40'
      )}
      disabled={isDownloading || disabled}
      tabIndex={tabIndex}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden
      >
        {isDownloading ? <Loader /> : getAttachmentIcon(attachment.mimeType, 'h-4 w-4')}
      </span>
      <div className="min-w-0 text-left">
        <div className="max-w-64 truncate whitespace-nowrap text-[13px] font-medium tracking-tight text-foreground">
          {attachment.fileName}
        </div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground">
          {formatFileSize(attachment.size)}
        </div>
      </div>
      {children}
    </Button>
  );
};

export default AttachmentItem;
