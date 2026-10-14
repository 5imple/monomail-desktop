import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { cn } from '@/renderer/app/lib/utils';

// Senders (Outlook especially) often label Office files and PDFs as
// application/octet-stream, so fall back to the file extension.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed'
};
const DOCUMENT_EXTENSIONS = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|md|pages|numbers|key)$/i;
const DOCUMENT_MIME =
  /^text\/|word|excel|spreadsheet|presentation|powerpoint|opendocument|rtf|csv/i;

export function resolveMimeType(mimeType: string, fileName?: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const extension = fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (MIME_BY_EXTENSION[extension]) return MIME_BY_EXTENSION[extension];
  if (fileName && DOCUMENT_EXTENSIONS.test(fileName)) return 'text/plain';
  return mimeType;
}

// What the preview dialog can actually show: PDFs and images Chromium renders
// in <img>. HEIC/TIFF resolve to image/* but can't be displayed, and Office /
// text files would only reach a "not supported" screen — those download.
const PREVIEWABLE_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml'
]);

export function isPreviewableAttachment(mimeType: string, fileName?: string): boolean {
  return PREVIEWABLE_MIMES.has(resolveMimeType(mimeType, fileName).toLowerCase());
}

// Callers that drop the icon into a styled container (e.g. the Newton
// attachment chip with its own bg + alignment) pass `className` to override
// the inline default margin and color. Unset = legacy inline behavior.
export function getAttachmentIcon(mimeType: string, className?: string, fileName?: string) {
  const cls = className ?? 'w-4 h-4 mr-1 text-muted-foreground';
  const mime = resolveMimeType(mimeType, fileName);
  if (mime === 'application/pdf') {
    // Keep the red tint even inside styled containers: it's how PDFs are
    // recognised at a glance.
    return (
      <MonoIcon
        type="picture_as_pdf"
        className={cn(className ?? 'mr-1 h-4 w-4', 'text-destructive/80')}
      />
    );
  }
  if (mime.startsWith('image/')) return <MonoIcon type="FileImage" className={cls} />;
  if (mime.startsWith('video/')) return <MonoIcon type="FileVideo" className={cls} />;
  if (mime.startsWith('audio/')) return <MonoIcon type="FileAudio" className={cls} />;
  if (/zip|rar|7z|tar|gzip/.test(mime)) return <MonoIcon type="FileArchive" className={cls} />;
  if (DOCUMENT_MIME.test(mime)) return <MonoIcon type="FileText" className={cls} />;
  // A plain document rather than the question-mark file, which read as an error.
  return <MonoIcon type="draft" className={cls} />;
}
