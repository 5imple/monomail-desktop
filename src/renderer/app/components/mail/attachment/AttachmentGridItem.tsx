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
        // Newton attachment chip: dedicated icon tile + two-line meta (file
        // name above, mono size below). Hover lifts the border only — accent
        // is intentionally neutral here so the chip stays calm in a list.
        'group flex w-full cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40',
        className
      )}
      tabIndex={tabIndex}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden
      >
        {isDownloading ? (
          <Loader />
        ) : (
          getAttachmentIcon(attachment.mimeType, 'h-4 w-4')
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
          {attachment.fileName}
        </div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground">
          {formatFileSize(attachment.size)}
        </div>
      </div>
      {children}
    </div>
  );
};

export default AttachmentGridItem;
