import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import { MonoAttachment } from '@/main/models/types';
import { Button, buttonVariants } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { getAttachmentIcon } from '@/renderer/app/lib/getAttachmentIcon';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface AttachmentGridItemProps {
  source: 'draft' | 'message';
  itemId: string;
  attachment: MonoAttachment;
  accountId: string;
  preview?: boolean;
  size?: 'default' | 'xs' | 'sm' | 'lg' | null | undefined;
  children?: React.ReactNode;
  disabled?: boolean;
  tabIndex?: number;
  className?: string;
}

const AttachmentGridItem: FC<AttachmentGridItemProps> = ({
  source = 'message',
  preview = false,
  itemId,
  accountId,
  attachment,
  size = 'sm',
  children,
  disabled,
  tabIndex,
  className
}) => {
  const { openDialog } = useDialogs();
  const [isDownloading, setIsDownloading] = useState(false);
  const { t } = useTranslation();
  const handlePreview = async () => {
    try {
      openDialog('attachmentPreview', {
        accountId,
        source,
        itemId,
        attachment
      });
    } catch (e) {
      console.error(e);
      toast.error(t('dialog.attachement_preview.error_downloading'));
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
    } catch (e) {
      console.error(e);
      toast.error(t('dialog.attachement_preview.error_downloading'));
    } finally {
      setIsDownloading(false);
    }
  };

  const formatFileSize = (size: number) => {
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div
      onClick={preview ? handlePreview : downloadAttachment}
      className={cn(
        buttonVariants({ variant: 'secondary' }),
        'flex w-full items-start items-center gap-1',
        className
      )}
      // disabled={isDownloading || disabled}
      tabIndex={tabIndex}
    >
      <div className="">{isDownloading ? <Loader /> : getAttachmentIcon(attachment.mimeType)}</div>
      <div className="flex flex-1 items-center overflow-hidden">
        <div className="overflow-hidden text-ellipsis">
          <span className="whitespace-nowrap text-sm font-medium">{attachment.fileName}</span>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatFileSize(attachment.size)}
        </span>
      </div>
      {children}
    </div>
  );
};

export default AttachmentGridItem;
