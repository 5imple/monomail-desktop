import MonoIcon from '@/renderer/app/components/icons/InboxIcon';

// Callers that drop the icon into a styled container (e.g. the Newton
// attachment chip with its own bg + alignment) pass `className` to override
// the inline default margin and color. Unset = legacy inline behavior.
export function getAttachmentIcon(mimeType: string, className?: string) {
  const cls = className ?? 'w-4 h-4 mr-1 text-muted-foreground';
  switch (mimeType) {
    case 'application/pdf':
      return <MonoIcon type="FileMinus" className={className ?? 'mr-1 h-4 w-4 text-destructive'} />;
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/svg':
    case 'image/svg+xml':
      return <MonoIcon type="FileImage" className={cls} />;
    case 'video/mp4':
    case 'video/x-matroska':
    case 'video/webm':
      return <MonoIcon type="FileVideo" className={cls} />;
    case 'audio/mpeg':
    case 'audio/wav':
      return <MonoIcon type="FileAudio" className={cls} />;
    case 'application/zip':
    case 'application/x-rar-compressed':
      return <MonoIcon type="FileArchive" className={cls} />;
    default:
      return <MonoIcon type="FileQuestion" className={cls} />;
  }
}

export function getAttachmentTypeName(mimeType: string) {
  switch (mimeType) {
    case 'application/octet-stream':
      return 'document';
    case 'application/x-rar-compressed':
      return 'rar';
    default:
      return mimeType.split('/')[1];
  }
}
