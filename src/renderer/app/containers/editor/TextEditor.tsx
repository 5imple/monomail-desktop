import { DraftUploadInlineImageResponse } from '@/main/api/draft/types';
import { IMonoTemplate } from '@/main/api/template/types';
import TextEditorToolbar from '@/renderer/app/containers/editor/TextEditorToolbar';
import { VariableEditorPopover } from '@/renderer/app/containers/editor/VariableEditor';
import { LinkButtonPopover } from '@/renderer/app/lib/text-editor/LinkButtonExtension';
import { getEditorExtensions } from '@/renderer/app/lib/text-editor/textEditorExtensions';
import { cn } from '@/renderer/app/lib/utils';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/react';
import React, { useEffect, useMemo } from 'react';

export const convertPlainTextToHtml = (text) => {
  // Check if the content is already HTML (simple check for tags)
  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    // If it's already HTML, we need to ensure proper line break handling
    // Check if the HTML contains <br> tags or <p> tags
    if (text.includes('<br') || text.includes('<p')) {
      // The content is already properly formatted HTML, return as is
      return text;
    }
    // If it's HTML but doesn't contain proper line break elements,
    // we might need to process it further
  }

  // Normalize line breaks to \n
  const normalizedText = text.replace(/\r\n/g, '\n');

  // Split by double newlines for paragraphs
  const htmlParagraphs = normalizedText
    .split('\n\n')
    .map((paragraph) => {
      if (!paragraph.trim()) return ''; // Skip empty paragraphs
      // Replace single newlines with <br> tags
      return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean) // Remove any empty strings
    .join('');

  return htmlParagraphs || '<p></p>'; // Default to empty paragraph if nothing else
};

const TextEditor = React.forwardRef(
  (
    {
      className,
      value,
      onChange,
      onEditorKeyDown,
      onUploadInlineImage,
      onUploadAttachment,
      onSelectTemplate,
      draftId
    }: {
      className?: string;
      value: string;
      onChange: (value: string) => void;
      onEditorKeyDown?: (view, event: KeyboardEvent) => boolean | void;
      onUploadInlineImage?: (
        file: File,
        uuid: string,
        draftId: string
      ) => Promise<DraftUploadInlineImageResponse>;
      onUploadAttachment?: (file: File) => Promise<void>;
      onSelectTemplate?: (template: IMonoTemplate) => void;
      draftId?: string;
    },
    ref
  ) => {
    const { templates } = useTemplateAtom();

    const processedContent = useMemo(() => {
      return convertPlainTextToHtml(value);
    }, [value]);

    const editor = useEditor({
      editorProps: {
        attributes: {
          class: cn(
            'w-full rounded-none bg-transparent p-4 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none',
            className
          )
        },
        handleKeyDown: onEditorKeyDown
      },
      parseOptions: {
        preserveWhitespace: 'full'
      },
      extensions: [
        ...getEditorExtensions({
          draftId,
          onUploadInlineImage,
          onUploadAttachment,
          templates,
          onSelectTemplate
        })
      ],
      content: processedContent,
      autofocus: true,

      onUpdate: ({ editor }) => {
        const htmlContent = editor.getHTML();
        onChange(htmlContent);
      }
    });

    // Add global CSS for links and setup event handlers
    useEffect(() => {
      if (!editor) return;

      // Add custom CSS for link styling and resizable image behavior.
      // Inline resize-handle colours use the Newton accent via the CSS
      // variable so they stay in lockstep with the rest of the palette
      // (no more hardcoded Tailwind blue 500).
      const customStyleElement = document.createElement('style');
      customStyleElement.textContent = `
        /* Ensure link bubble menu has higher z-index than link overlay */
        .link-bubble-menu {
          z-index: 50;
        }

        /* Resizable image styles */
        .resizable-image {
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .resizable-image:hover,
        .resizable-image.ProseMirror-selectednode {
          outline: 2px solid hsl(var(--accent));
          outline-offset: 2px;
        }

        /* Ensure proper image sizing */
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          display: inline-block;
        }

        /* Resize handles for images */
        .image-resizer {
          position: relative;
          display: inline-block;
        }

        .image-resizer .resize-trigger {
          position: absolute;
          bottom: -6px;
          right: -6px;
          width: 12px;
          height: 12px;
          background: hsl(var(--accent));
          border: 2px solid hsl(var(--background));
          border-radius: 50%;
          cursor: nw-resize;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 10;
        }

        .image-resizer:hover .resize-trigger,
        .image-resizer.ProseMirror-selectednode .resize-trigger {
          opacity: 1;
        }
      `;
      document.head.appendChild(customStyleElement);

      // Setup additional handlers to ensure link selection
      const editorElement = editor.view.dom;

      const handleLinkClick = (event) => {
        // Find if we clicked on a link
        const target = event.target.closest('a');
        if (target) {
          event.preventDefault();

          // Get link position data
          const href = target.getAttribute('href');
          const linkText = target.textContent;

          // Find the closest ProseMirror position to the clicked element
          const domPosNear = editor.view.posAtDOM(target, 0);

          if (domPosNear !== null) {
            // Force link selection
            editor.commands.extendMarkRange('link');
          }
        }
      };

      editorElement.addEventListener('click', handleLinkClick);

      // Cleanup function
      return () => {
        document.head.removeChild(customStyleElement);
        editorElement.removeEventListener('click', handleLinkClick);
      };
    }, [editor]);

    const replaceSkeletonImage = React.useCallback(
      (skeletonId: string, finalUrl: string, fileName: string) => {
        if (!editor) return;

        // Search through all images in the document. If `title===skeletonId`, replace.
        const { state, view } = editor;
        const tr = state.tr;

        state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.title === skeletonId) {
            // Update node attributes
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              src: finalUrl,
              title: fileName, // or keep it empty
              alt: fileName
            });
          }
        });

        if (tr.docChanged) {
          view.dispatch(tr);
        }
      },
      [editor]
    );

    // Helper: remove skeleton if the upload fails
    const removeSkeletonImage = React.useCallback(
      (skeletonId: string) => {
        if (!editor) return;
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
      },
      [editor]
    );

    React.useImperativeHandle(ref, () => ({
      setContent: (content: string) => {
        if (editor) {
          editor.commands.setContent(content);
        }
      },
      focus: () => {
        if (editor) {
          editor.commands.focus();
        }
      }
    }));

    return (
      <div className="relative">
        <EditorContent className={cn('max-w-none')} editor={editor} />

        {/* Variable editor popover - triggered by clicking variables */}
        {editor && <VariableEditorPopover editor={editor} />}

        {/* Link Button Popover - new approach for link editing */}
        {editor && <LinkButtonPopover editor={editor} />}

        {/* Original bubble menu for formatting - only show when NOT on a link */}
        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor, view }) => {
              // Only show formatting toolbar if:
              // 1. There is text selected
              // 2. The selection is not empty
              // 3. We are NOT on a link (important to prevent both menus from showing)
              const { state } = view;
              const { empty } = state.selection;

              // Don't show the formatting toolbar if we're on a link
              if (editor.isActive('link')) {
                return false;
              }

              // Don't show if selection is empty
              if (empty) {
                return false;
              }

              return true;
            }}
            tippyOptions={{
              duration: 100,
              appendTo: 'parent',
              theme: 'mono',
              arrow: false,
              placement: 'top',
              maxWidth: 'none'
              // Pre-Phase-4 the BubbleMenu forced a dark class onto the
              // tippy popper so the toolbar always rendered dark-on-dark.
              // That made the menu read as a chunky black slab against
              // the light Newton UI. The toolbar now uses the standard
              // popover treatment driven by the `mono` tippy theme
              // (defined in global.css).
            }}
          >
            <TextEditorToolbar editor={editor} />
          </BubbleMenu>
        )}
      </div>
    );
  }
);

TextEditor.displayName = 'TextEditor';
export default TextEditor;
