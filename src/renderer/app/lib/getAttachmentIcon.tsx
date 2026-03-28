import MonoIcon from '@/renderer/app/components/icons/icons';

export function getAttachmentIcon(mimeType: string) {
  switch (mimeType) {
    case 'application/pdf':
      return <MonoIcon type="FileMinus" className="w-4 h-4 mr-1 text-destructive" />;
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/svg':
    case 'image/svg+xml':
      return <MonoIcon type="FileImage" className="w-4 h-4 mr-1 text-muted-foreground" />;
    case 'video/mp4':
    case 'video/x-matroska':
    case 'video/webm':
      return <MonoIcon type="FileVideo" className="w-4 h-4 mr-1 text-muted-foreground" />;
    case 'audio/mpeg':
    case 'audio/wav':
      return <MonoIcon type="FileAudio" className="w-4 h-4 mr-1 text-muted-foreground" />;
    case 'application/zip':
    case 'application/x-rar-compressed':
      return <MonoIcon type="FileArchive" className="w-4 h-4 mr-1 text-muted-foreground" />;
    default:
      return <MonoIcon type="FileQuestion" className="w-4 h-4 mr-1 text-muted-foreground" />;
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
