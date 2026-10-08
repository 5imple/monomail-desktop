import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { DBGetAttachmentBlob } from '@/renderer/app/lib/db/draftAttachment';
import { MonoAttachment } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import Loader from '@/renderer/app/components/ui/loader';
import { Separator } from '@/renderer/app/components/ui/separator';
import { isPreviewableAttachment, resolveMimeType } from '@/renderer/app/lib/getAttachmentIcon';
import { cn } from '@/renderer/app/lib/utils';
import React, { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { toast } from 'sonner';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface AttachmentPreviewDialogProps {
  children?: React.ReactNode;
  accountId: string;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  source: 'message' | 'draft';
  itemId: string;
  attachment?: MonoAttachment;
}

const AttachmentPreviewDialog: FC<AttachmentPreviewDialogProps> = ({
  children,
  accountId,
  open,
  onOpenChange,
  itemId,
  source = 'message',
  attachment
}) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const [blobUrl, setBlobUrl] = useState<string>('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const handlePreview = async () => {
    if (!attachment) return;

    try {
      setIsLoaded(false);
      setLoadError(false);

      let response: Blob | null = null;
      if (source === 'draft') {
        // Standalone: draft attachment bytes are held locally.
        const record = await DBGetAttachmentBlob(accountId, attachment.attachmentId);
        response = record?.blob ?? null;
      } else {
        response = await mailApi.getAttachmentDownload(
          accountId,
          itemId,
          attachment.attachmentId,
          attachment.fileName
        );
      }

      if (!response) {
        setLoadError(true);
        return;
      }

      setBlob(response);
      const url = URL.createObjectURL(response);
      setBlobUrl(url);
      setIsLoaded(true);
    } catch (e) {
      console.error(e);
      setLoadError(true);
      toast.error(t('dialog.attachment_preview.error_downloading'));
    }
  };

  useEffect(() => {
    if (attachment && itemId) {
      setBlobUrl('');
      setBlob(null);
      setIsLoaded(false);
      setLoadError(false);
      handlePreview();
    }
  }, [attachment, itemId, source]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const downloadAttachment = async () => {
    if (!accountId || !blobUrl || !attachment) return;
    try {
      setIsDownloading(true);

      // Create an anchor element to trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      toast.error(t('dialog.attachment_preview.error_downloading'));
    } finally {
      setIsDownloading(false);
    }
  };

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  function changePage(offset) {
    setPageNumber((prevPageNumber) =>
      Math.min(Math.max(prevPageNumber + offset, 1), Math.max(numPages, 1))
    );
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  if (!attachment) return null;

  // Outlook often labels PDFs/images application/octet-stream: go by the
  // resolved type (extension fallback), like the attachment icons do.
  const resolvedMime = resolveMimeType(attachment.mimeType, attachment.fileName).toLowerCase();
  const previewable = isPreviewableAttachment(attachment.mimeType, attachment.fileName);
  const isPDF = previewable && resolvedMime === 'application/pdf';
  const isImage = previewable && resolvedMime.startsWith('image/');

  const renderError = () => {
    return (
      <div className="text-center text-sm">
        <MonoIcon type={'AlertCircle'} className="mx-auto h-5 w-5 text-destructive" />
        <div className="mt-2 text-foreground">{t('dialog.attachment_preview.not_supported')}</div>

        <Button onClick={downloadAttachment} className="mt-4" type="button" variant={'secondary'}>
          {isDownloading ? <Loader /> : <MonoIcon type={'Download'} className="mr-2 h-4 w-4" />}
          {attachment.fileName}
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark bg-popover/70"></DialogOverlay>

        <DialogContent
          closeButton={false}
          className="dark flex h-screen w-fit max-w-none flex-col items-center justify-center gap-0 rounded-none border-none bg-transparent p-0 text-foreground shadow-none"
          onKeyDown={(e) => {
            // ← / → turn PDF pages (and must not also move the list cursor).
            if (!isPDF || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
            e.preventDefault();
            e.stopPropagation();
            changePage(e.key === 'ArrowLeft' ? -1 : 1);
          }}
        >
          <DialogTitle className="sr-only">{attachment.fileName}</DialogTitle>
          {/* Everything below is gated on `blob`, so without these the overlay
              sat empty while a large file downloaded and forever on failure. */}
          {!blob && !loadError && <Loader />}
          {!blob && loadError && (
            <div className="text-center text-sm">
              <MonoIcon type={'AlertCircle'} className="mx-auto h-5 w-5 text-destructive" />
              <div className="mt-2 text-foreground">
                {t('dialog.attachment_preview.error_downloading')}
              </div>
              <Button onClick={handlePreview} className="mt-4" type="button" variant={'secondary'}>
                {t('thread_list.try_again')}
              </Button>
            </div>
          )}
          {blob &&
            (isPDF ? (
              <div>
                {!isLoaded && <Loader />}
                <div
                  className={cn(
                    'transition-all duration-200',
                    isLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  <Document
                    file={blob}
                    loading={<Loader />}
                    error={renderError}
                    noData={<></>}
                    onLoadSuccess={onDocumentLoadSuccess}
                  >
                    {/* Fit the page to the window, leaving room for the toolbar. */}
                    <Page pageNumber={pageNumber} height={Math.max(window.innerHeight - 160, 240)} />
                  </Document>
                </div>
              </div>
            ) : isImage ? (
              <div>
                {!isLoaded && <Loader />}
                {isLoaded && (
                  <img
                    src={blobUrl}
                    alt={attachment.fileName}
                    className="max-h-[calc(100vh-9rem)] max-w-[92vw] object-contain"
                  />
                )}
              </div>
            ) : (
              renderError()
            ))}

          {blob && (isPDF || isImage) && (
            <div className="fixed bottom-12 z-50">
              {/* <div className="pb-12 pt-64 w-full bg-gradient-to-t from-black/70 to-transparent"> */}
              <div className="dark mx-auto flex w-fit items-center gap-1 rounded-lg bg-card/75 pl-3 shadow-md">
                <span
                  className="max-w-[40vw] truncate text-sm text-foreground"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </span>
                <Separator orientation={'vertical'} className="mx-1 h-4 bg-muted-foreground" />
                {isPDF && (
                  <>
                    <Button
                      className="hover:bg-card/50"
                      variant={'text'}
                      typeVariant={'icon'}
                      disabled={pageNumber <= 1}
                      tooltip={t('dialog.attachment_preview.previous_page')}
                      onClick={previousPage}
                    >
                      <MonoIcon type={'ChevronLeft'} />
                    </Button>
                    <div className="whitespace-nowrap text-sm text-foreground">
                      {pageNumber || (numPages ? 1 : '--')} / {numPages || '--'}
                    </div>
                    <Button
                      className="hover:bg-card/50"
                      variant={'text'}
                      typeVariant={'icon'}
                      disabled={pageNumber >= numPages}
                      tooltip={t('dialog.attachment_preview.next_page')}
                      onClick={nextPage}
                    >
                      <MonoIcon type={'ChevronRight'} />
                    </Button>
                    <Separator orientation={'vertical'} className="h-4 bg-muted-foreground" />
                  </>
                )}

                <Button
                  className="hover:bg-card/50"
                  variant={'text'}
                  typeVariant={'icon'}
                  tooltip={t('dialog.attachment_preview.download')}
                  onClick={downloadAttachment}
                >
                  {isDownloading ? <Loader /> : <MonoIcon type={'Download'} />}
                </Button>
                <DialogClose asChild>
                  <Button
                    className="hover:bg-card/50"
                    variant={'text'}
                    typeVariant={'icon'}
                    tooltip={t('tooltip.close')}
                  >
                    <MonoIcon type={'X'} />
                  </Button>
                </DialogClose>
              </div>
            </div>
            // </div>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default AttachmentPreviewDialog;
