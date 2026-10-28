import { DraftUploadInlineImageResponse } from '@/main/api/draft/types';
import { IMonoTemplate } from '@/main/api/template/types';
import TextEditorToolbar from '@/renderer/app/containers/editor/TextEditorToolbar';
import { VariableEditorPopover } from '@/renderer/app/containers/editor/VariableEditor';
import { convertPlainTextToHtml } from '@/renderer/app/lib/text-editor/convertPlainTextToHtml';
import { LinkButtonPopover } from '@/renderer/app/lib/text-editor/LinkButtonExtension';
import { getEditorExtensions } from '@/renderer/app/lib/text-editor/textEditorExtensions';
import { cn } from '@/renderer/app/lib/utils';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Kept for existing imports; the helper lives on its own so showing a draft
// doesn't load the editor.
export { convertPlainTextToHtml };

export interface TextEditorHandle {
  setContent: (content: string) => void;
  focus: (position?: 'start' | 'end') => void;
  /** The document as HTML (serialised on demand). */
  getHTML: () => string | null;
  /** The document's plain text. */
  getText: () => string;
  /** Inserts HTML at the caret. */
  insertContent: (content: string) => void;
}

const TextEditor = React.forwardRef<
  TextEditorHandle,
  {
    className?: string;
    /** The initial content. Later changes are ignored (the editor owns its text). */
    value: string;
    /** Every change, with the document as HTML. */
    onChange?: (value: string) => void;
    /**
     * Every change, without serialising the document. For callers that read
     * getHTML() when they need it (compose), so a keystroke stays cheap.
     */
    onDirty?: () => void;
    onEditorKeyDown?: (view, event: KeyboardEvent) => boolean | void;
    onUploadInlineImage?: (
      file: File,
      uuid: string,
      draftId: string
    ) => Promise<DraftUploadInlineImageResponse>;
    onUploadAttachment?: (file: File) => Promise<void>;
    onSelectTemplate?: (template: IMonoTemplate) => void;
    draftId?: string;
    /** true = start of the doc; 'end' puts the caret after existing text. */
    autofocus?: boolean | 'start' | 'end';
  }
>(
  (
    {
      className,
      value,
      onChange,
      onDirty,
      onEditorKeyDown,
      onUploadInlineImage,
      onUploadAttachment,
      onSelectTemplate,
      draftId,
      autofocus = true
    },
    ref
  ) => {
    const { templates } = useTemplateAtom();
    const { t } = useTranslation();

    // Callbacks read through refs, so the editor's extensions and props are
    // built once: TipTap compares them by identity on every render and
    // re-applied its options (view.setProps + updateState) per keystroke.
    const latest = useRef({
      onChange,
      onDirty,
      onEditorKeyDown,
      onUploadInlineImage,
      onUploadAttachment,
      onSelectTemplate,
      templates
    });
    latest.current = {
      onChange,
      onDirty,
      onEditorKeyDown,
      onUploadInlineImage,
      onUploadAttachment,
      onSelectTemplate,
      templates
    };

    // Content is only read when the editor is created.
    const [initialContent] = useState(() => convertPlainTextToHtml(value));

    const [extensions] = useState(() =>
      getEditorExtensions({
        t,
        draftId,
        onUploadInlineImage: (file, uuid, id) => {
          const upload = latest.current.onUploadInlineImage;
          if (!upload) return Promise.reject(new Error('Inline images are not supported here'));
          return upload(file, uuid, id);
        },
        onUploadAttachment: async (file) => {
          await latest.current.onUploadAttachment?.(file);
        },
        getTemplates: () => latest.current.templates,
        // Only when given: without it, the slash menu inserts the body itself.
        onSelectTemplate: onSelectTemplate
          ? (template) => latest.current.onSelectTemplate?.(template)
          : undefined
      })
    );

    const editorProps = useMemo(
      () => ({
        attributes: {
          class: cn(
            'w-full rounded-none bg-transparent p-4 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none',
            className
          )
        },
        handleKeyDown: (view, event: KeyboardEvent) =>
          latest.current.onEditorKeyDown?.(view, event) ?? false
      }),
      [className]
    );
    const [parseOptions] = useState(() => ({ preserveWhitespace: 'full' as const }));

    const editor = useEditor({
      editorProps,
      parseOptions,
      extensions,
      content: initialContent,
      autofocus,
      // The toolbar and popovers follow the editor themselves; re-rendering
      // this component on every transaction re-rendered all of them.
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor }) => {
        latest.current.onDirty?.();
        if (latest.current.onChange) latest.current.onChange(editor.getHTML());
      }
    });

    // Clicking a link selects it (for the link popover) instead of following it.
    useEffect(() => {
      if (!editor) return;
      const editorElement = editor.view.dom;

      const handleLinkClick = (event) => {
        const target = event.target.closest('a');
        if (target) {
          event.preventDefault();
          const domPosNear = editor.view.posAtDOM(target, 0);
          if (domPosNear !== null) {
            editor.commands.extendMarkRange('link');
          }
        }
      };

      editorElement.addEventListener('click', handleLinkClick);
      return () => {
        editorElement.removeEventListener('click', handleLinkClick);
      };
    }, [editor]);

    React.useImperativeHandle(
      ref,
      () => ({
        setContent: (content: string) => {
          if (editor) {
            editor.commands.setContent(content);
          }
        },
        focus: (position?: 'start' | 'end') => {
          if (!editor || editor.isDestroyed) return;
          editor.commands.focus(position);
          // TipTap moves DOM focus a frame later (requestAnimationFrame);
          // keys typed in that frame went to whatever had focus before.
          // ProseMirror's own focus is synchronous and keeps the selection
          // just set.
          editor.view.focus();
        },
        getHTML: () => {
          if (!editor) return null;
          try {
            return editor.getHTML();
          } catch {
            return null;
          }
        },
        getText: () => {
          if (!editor) return '';
          try {
            return editor.getText();
          } catch {
            return '';
          }
        },
        insertContent: (content: string) => {
          if (editor) {
            editor.chain().focus().insertContent(content).run();
          }
        }
      }),
      [editor]
    );

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
              // The toolbar uses the standard popover treatment driven by the
              // `mono` tippy theme (defined in global.css).
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
// The editor owns its content; a parent re-render (compose's recipients,
// save status) has nothing to tell it unless its props changed.
export default React.memo(TextEditor);
