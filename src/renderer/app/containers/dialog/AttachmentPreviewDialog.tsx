import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { DBGetAttachmentBlob } from '@/renderer/app/lib/db/draftAttachment';
import { MonoAttachment } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import Loader from '@/renderer/app/components/ui/loader';
import { Separator } from '@/renderer/app/components/ui/separator';
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

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const handlePreview = async () => {
    if (!attachment) return;

    try {
      setIsLoaded(false);

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

      if (!response) return;

      setBlob(response);
      const url = URL.createObjectURL(response);
      setBlobUrl(url);
      setIsLoaded(true);
    } catch (e) {
      console.error(e);
      toast.error(t('dialog.attachement_preview.error_downloading'));
    }
  };

  useEffect(() => {
    if (attachment && itemId) {
      setBlobUrl('');
      setBlob(null);
      setIsLoaded(false);
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
      toast.error(t('dialog.attachement_preview.error_downloading'));
    } finally {
      setIsDownloading(false);
    }
  };

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  function changePage(offset) {
    setPageNumber((prevPageNumber) => prevPageNumber + offset);
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  if (!attachment) return null;

  const isImage = attachment.mimeType.includes('image');
  const isPDF = attachment.mimeType.includes('pdf');

  const renderError = () => {
    return (
      <div className="text-center text-sm">
        <MonoIcon type={'AlertCircle'} className="mx-auto h-5 w-5 text-destructive" />
        <div className="mt-2 text-white">{t('dialog.attachment_preview.not_supported')}</div>

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
          aria-description=""
          closeButton={false}
          className="flex h-screen w-fit flex-col items-center justify-center gap-0 rounded-none border-none bg-transparent p-0 shadow-none dark:border"
        >
          <DialogTitle className="hidden"></DialogTitle>
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
                    loading={<></>}
                    error={renderError}
                    noData={<></>}
                    onLoadSuccess={onDocumentLoadSuccess}
                  >
                    <Page pageNumber={pageNumber} scale={1} />
                  </Document>
                </div>
              </div>
            ) : isImage ? (
              <div>
                {!isLoaded && <Loader />}
                {isLoaded && (
                  <img src={blobUrl} alt={attachment.fileName} className="max-h-full max-w-full" />
                )}
              </div>
            ) : (
              renderError()
            ))}

          {(isPDF || isImage) && (
            <div className="fixed bottom-12 z-50">
              {/* <div className="pb-12 pt-64 w-full bg-gradient-to-t from-black/70 to-transparent"> */}
              <div className="dark mx-auto flex w-fit items-center gap-1 rounded-lg bg-card/75 shadow-md">
                {isPDF && (
                  <>
                    <Button
                      className="hover:bg-card/50"
                      variant={'text'}
                      typeVariant={'icon'}
                      disabled={pageNumber <= 1}
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
                  onClick={downloadAttachment}
                >
                  {isDownloading ? <Loader /> : <MonoIcon type={'Download'} />}
                </Button>
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
