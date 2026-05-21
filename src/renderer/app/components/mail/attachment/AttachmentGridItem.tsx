import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import { MonoAttachment } from '@/main/models/types';
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

  // Format file size with appropriate unit. The previous version forced
  // MB even for byte-scale files (showing "0.00 MB" for a 200-byte
  // signature image), which read as broken.
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div
      onClick={preview ? handlePreview : downloadAttachment}
      className={cn(
        // Newton attachment row: calm card chrome, accent on hover so the
        // download affordance is clear without shouting.
        'group flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 transition-colors hover:border-accent/40 hover:bg-accent/5',
        className
      )}
      tabIndex={tabIndex}
    >
      <div className="shrink-0 text-muted-foreground transition-colors group-hover:text-accent">
        {isDownloading ? <Loader /> : getAttachmentIcon(attachment.mimeType)}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] font-medium tracking-tight text-foreground">
          {attachment.fileName}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground">
          {formatFileSize(attachment.size)}
        </span>
      </div>
      {children}
    </div>
  );
};

export default AttachmentGridItem;
