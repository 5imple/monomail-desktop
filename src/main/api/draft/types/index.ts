import { IMonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoAttachment } from '@/main/models/types';

// Draft request for creation
export interface MonoDraftCreateRequest extends IMonoDraft {}

// Draft request for update
export interface MonoDraftUpdateRequest extends Omit<IMonoDraft, 'id'> {}

// Draft response structure
export interface MonoDraftGetResponse {
  drafts: Record<string, IMonoDraft[]>;
}

export interface SendDraftResponse {
  messageId: string;
}

export interface UploadDraftAttachmentResponse {
  attachments: Record<string, MonoAttachment>;
}

// Interface for the response of Get Attachment
export interface DraftAttachmentDownloadResponse {
  attachmentId: string;
  fileName: string;
  size: number;
  data: string;
  mimeType: string;
}

export interface DraftUploadInlineImageResponse {
  inlineImage: Record<
    string,
    {
      attachmentId: string;
      fileName: string;
      mimeType: string;
      size: number;
      url: string;
    }
  >;
}
