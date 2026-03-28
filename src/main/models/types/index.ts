// Interface for a recipient in a Gmail message
export interface MonoRecipient {
  name: string;
  email: string;
}
// Interface for a Gmail attachment
export interface MonoAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
}
