import mailApi from '@/main/api/mail/mailApi';
import { DBGetAttachmentBlob } from '@/renderer/app/lib/db/draftAttachment';
import { MonoAttachment } from '@/main/models/types';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import { getAttachmentIcon, isPreviewableAttachment } from '@/renderer/app/lib/getAttachmentIcon';
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
  /** `chip`: a compact one-line pill for dense surfaces like inbox rows. */
  variant?: 'card' | 'chip';
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
  tabIndex,
  variant = 'card'
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
        // Standalone: draft attachment bytes are held locally.
        const record = await DBGetAttachmentBlob(accountId, attachment.attachmentId);
        response = record?.blob ?? null;
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

  // Only PDFs and browser-renderable images open the preview; Office files,
  // HEIC, zips… went to a "Not supported" screen with a second download button.
  const openAttachment = () =>
    preview && isPreviewableAttachment(attachment.mimeType, attachment.fileName)
      ? handlePreview()
      : downloadAttachment();

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (variant === 'chip') {
    return (
      <Button
        variant={'ghost'}
        sizeVariant={'xs'}
        onClick={(e) => {
          // A row click opens the email; the chip opens just the attachment.
          e.stopPropagation();
          void openAttachment();
        }}
        tooltip={`${attachment.fileName} · ${formatFileSize(attachment.size)}`}
        aria-label={attachment.fileName}
        className={cn(
          // Inbox-row chip: one line, sized like the row's metadata text, so
          // it reads as a detail of the email rather than a separate card.
          'group h-6 w-fit max-w-[220px] gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 text-[11.5px] font-normal text-muted-foreground shadow-none',
          'hover:border-border hover:bg-muted/60 hover:text-foreground'
        )}
        disabled={isDownloading || disabled}
        tabIndex={tabIndex}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
          {isDownloading ? (
            <Loader />
          ) : (
            getAttachmentIcon(attachment.mimeType, 'h-3.5 w-3.5', attachment.fileName)
          )}
        </span>
        <span className="min-w-0 truncate">{attachment.fileName}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground/70">
          {formatFileSize(attachment.size)}
        </span>
        {children}
      </Button>
    );
  }

  return (
    <Button
      variant={'secondary'}
      sizeVariant={size}
      onClick={() => void openAttachment()}
      tooltip={`${attachment.fileName} · ${formatFileSize(attachment.size)}`}
      aria-label={attachment.fileName}
      className={cn(
        // Newton attachment chip (button variant for inline-flow use):
        // icon tile on the left, file name + mono size stacked on the right.
        // h-auto overrides the Button sizeVariant's fixed height (e.g. sm=h-8),
        // which otherwise clamps the chip shorter than its h-9 icon tile + two
        // text lines and makes the content spill outside the rounded border.
        // bg-none: the secondary variant's gradient showed through bg-card.
        'group flex h-auto w-fit items-center gap-3 rounded-md border border-border/60 bg-card bg-none px-3 py-2 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/40'
      )}
      disabled={isDownloading || disabled}
      tabIndex={tabIndex}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden
      >
        {isDownloading ? (
          <Loader />
        ) : (
          getAttachmentIcon(attachment.mimeType, 'h-4 w-4', attachment.fileName)
        )}
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
