import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import { MonoAttachment } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
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
        apiClient.setApiClientIdToken(accountId);
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
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <Button
      variant={'secondary'}
      sizeVariant={size}
      onClick={preview ? handlePreview : downloadAttachment}
      className={cn('flex w-fit items-center justify-center gap-2 rounded-md border p-3 shadow-sm')}
      disabled={isDownloading || disabled}
      tabIndex={tabIndex}
    >
      {isDownloading ? <Loader className="mr-1" /> : getAttachmentIcon(attachment.mimeType)}
      <div className="flex flex-1 items-center text-sm">
        <div className="max-w-64 overflow-hidden text-ellipsis">
          <span className="whitespace-nowrap">{attachment.fileName}</span>
        </div>
        <span className="ml-2 mt-0.5 text-xs text-muted-foreground">
          {formatFileSize(attachment.size)}
        </span>
        {children}
      </div>
    </Button>
  );
};

export default AttachmentItem;
