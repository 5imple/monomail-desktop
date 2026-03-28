import { FileHandler } from '@tiptap/extension-file-handler';
import { toast } from 'sonner';
import { generateUUID } from '@/main/utils';
import { Editor } from '@tiptap/react';
import { DraftUploadInlineImageResponse } from '@/main/api/draft/types';
import { useTranslation } from 'react-i18next';

// Utility function to check if file is an image
function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') &&
    ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(
      file.type
    )
  );
}

const SKELETON_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

function insertSkeletonImage(editor: Editor, pos: number): string {
  const skeletonId = `skeleton-${generateUUID()}`;
  editor
    .chain()
    .insertContentAt(pos, {
      type: 'skeleton',
      attrs: { id: skeletonId, width: 400, height: 300 }
    })
    .focus()
    .run();
  return skeletonId;
}

function replaceSkeletonImage(
  editor: Editor,
  skeletonId: string,
  finalUrl: string,
  fileName: string
) {
  const { state, view } = editor;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'skeleton' && node.attrs.id === skeletonId) {
      tr.setNodeMarkup(pos, editor.schema.nodes.image, {
        src: finalUrl,
        title: fileName,
        alt: fileName
      });
    }
  });
  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

function removeSkeletonImage(editor: Editor, skeletonId: string) {
  const { state, view } = editor;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.title === skeletonId) {
      tr.delete(pos, pos + node.nodeSize);
    }
  });
  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

/**
 * ExtendedFileHandler
 *
 * This extension overrides the default onDrop and onPaste behavior.
 * It defines custom options:
 *
 *  • draftId: string | null
 *  • onUploadInlineImage: (file: File, uuid: string, draftId: string) => Promise<any>
 *  • onUploadAttachment: (file: File) => Promise<void>
 *
 * When a file is dropped or pasted:
 *  - If it's an image file: inserts skeleton and calls onUploadInlineImage
 *  - If it's a non-image file: calls onUploadAttachment to handle as attachment
 *  - Fallback: insert image as base64 for images, ignore other files
 */
export const ExtendedFileHandler = (
  draftId?: string,
  onUploadInlineImage?: (
    file: File,
    uuid: string,
    draftId: string
  ) => Promise<DraftUploadInlineImageResponse>,
  onUploadAttachment?: (file: File) => Promise<void>
) =>
  FileHandler.extend({
    addOptions() {
      const { t } = useTranslation();
      return {
        ...this.parent?.(),

        onDrop(editor: Editor, files: File[], pos: number) {
          files.forEach((file) => {
            if (isImageFile(file)) {
              // Handle image files - insert inline
              if (!draftId || !onUploadInlineImage) {
                // Fallback: insert image as base64
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  editor
                    .chain()
                    .insertContentAt(pos, {
                      type: 'image',
                      attrs: { src: reader.result }
                    })
                    .focus()
                    .run();
                };
                return;
              }

              // 1) Insert a skeleton image at the given position.
              const skeletonId = insertSkeletonImage(editor, pos);
              // 2) Generate a unique ID for the upload.
              const uploadUUID = generateUUID();
              // 3) Call the upload API.
              onUploadInlineImage(file, uploadUUID, draftId)
                .then((res: DraftUploadInlineImageResponse) => {
                  // Assume the API returns an object under "inlineImage".
                  const resultObj = Object.values(res.inlineImage)[0];
                  replaceSkeletonImage(editor, skeletonId, resultObj.url, file.name);
                })
                .catch((error: any) => {
                  console.error('Error uploading image:', error);
                  toast.error(t('toast.error.image_upload'));
                  removeSkeletonImage(editor, skeletonId);
                });
            } else {
              // Handle non-image files - add as attachment
              if (onUploadAttachment) {
                onUploadAttachment(file).catch((error: any) => {
                  console.error('Error uploading attachment:', error);
                  toast.error(t('toast.error.file_upload_network', 'Failed to upload attachment'));
                });
              } else {
                // No attachment handler provided, show message
                toast.info(
                  t(
                    'toast.info.attachment_not_supported',
                    'Attachment upload not available in this context'
                  )
                );
              }
            }
          });
        },

        onPaste(editor: Editor, files: File[], pasteContent?: string) {
          // If there is HTML content (e.g. from copying a webpage), let default behavior occur.
          if (pasteContent) return false;

          files.forEach((file) => {
            if (isImageFile(file)) {
              // Handle image files - insert inline
              if (!draftId || !onUploadInlineImage) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  editor
                    .chain()
                    .insertContentAt(editor.state.selection.anchor, {
                      type: 'image',
                      attrs: { src: reader.result }
                    })
                    .focus()
                    .run();
                };
                return;
              }

              const skeletonId = insertSkeletonImage(editor, editor.state.selection.anchor);
              const uploadUUID = generateUUID();

              onUploadInlineImage(file, uploadUUID, draftId)
                .then((res: DraftUploadInlineImageResponse) => {
                  const resultObj = Object.values(res.inlineImage)[0];
                  replaceSkeletonImage(editor, skeletonId, resultObj.url, file.name);
                })
                .catch((error: any) => {
                  console.error('Error uploading image:', error);
                  toast.error(t('toast.error.image_upload'));
                  removeSkeletonImage(editor, skeletonId);
                });
            } else {
              // Handle non-image files - add as attachment
              if (onUploadAttachment) {
                onUploadAttachment(file).catch((error: any) => {
                  console.error('Error uploading attachment:', error);
                  toast.error(t('toast.error.file_upload_network', 'Failed to upload attachment'));
                });
              } else {
                // No attachment handler provided, show message
                toast.info(
                  t(
                    'toast.info.attachment_not_supported',
                    'Attachment upload not available in this context'
                  )
                );
              }
            }
          });

          return;
        }
      };
    }
  });
