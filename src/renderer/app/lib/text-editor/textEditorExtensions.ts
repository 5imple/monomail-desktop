import { ProofreadMarks } from '@/renderer/app/lib/proofreadMarks';
import { SuggestionMarks } from '@/renderer/app/lib/suggestionMarks';
import { Blockquote } from '@tiptap/extension-blockquote';
import { BulletList } from '@tiptap/extension-bullet-list';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Color } from '@tiptap/extension-color';
import { Document } from '@tiptap/extension-document';
import BaseHeading from '@tiptap/extension-heading';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';
import { ImageResize } from '@/renderer/app/lib/text-editor/ImageResize';

import { DraftUploadInlineImageResponse } from '@/main/api/draft/types';
import { IMonoTemplate } from '@/main/api/template/types';
import { VariableExtension } from '@/renderer/app/containers/editor/VariableEditor';
import { ExtendedFileHandler } from '@/renderer/app/lib/text-editor/ExtendedFileHandler';
import { SkeletonNode } from '@/renderer/app/lib/text-editor/SkeletonNode';
import EditorCommandExtension from '@/renderer/app/lib/text-editor/command/EditorCommandExtension';
import EditorCommandList from '@/renderer/app/lib/text-editor/command/EditorCommandList';
import getCommandSuggestions from '@/renderer/app/lib/text-editor/command/getCommandSuggestions';
import { mergeAttributes } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import { useTranslation } from 'react-i18next';
import { LinkButtonExtension } from '@/renderer/app/lib/text-editor/LinkButtonExtension';
import { PlainTextPasteExtension } from '@/renderer/app/lib/text-editor/PlainTextPasteExtension';

type Levels = 1 | 2 | 3;

const classes: Record<Levels, string> = {
  1: 'text-3xl font-semibold',
  2: 'text-2xl font-semibold',
  3: 'text-xl font-semibold'
};

export const Heading = BaseHeading.configure({ levels: [1, 2, 3] }).extend({
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level: Levels = hasLevel ? node.attrs.level : this.options.levels[0];

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `${classes[level]}`
      }),
      0
    ];
  }
});

export interface EditorExtensionsOptions {
  draftId?: string;
  onUploadInlineImage?: (
    file: File,
    uuid: string,
    draftId: string
  ) => Promise<DraftUploadInlineImageResponse>;
  onUploadAttachment?: (file: File) => Promise<void>;
  templates?: IMonoTemplate[];
  onSelectTemplate?: (template: IMonoTemplate) => void;
}

export const getEditorExtensions = ({
  draftId,
  onUploadInlineImage,
  onUploadAttachment,
  templates = [],
  onSelectTemplate
}: EditorExtensionsOptions = {}) => {
  const { t } = useTranslation();
  return [
    Document,
    StarterKit.configure({
      paragraph: {
        HTMLAttributes: {
          // class: 'my-2'
        }
      },
      gapcursor: false
    }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    ImageResize.configure({
      allowBase64: true,
      inline: true,
      HTMLAttributes: {
        class: 'height-auto max-w-full inline-block'
        // class: 'max-w-[600px] w-full inline-block'
      }
    }),
    SkeletonNode,
    TextStyle.extend({
      addAttributes() {
        return {
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) {
                return {};
              }
              return {
                style: `background-color: ${attributes.backgroundColor}`
              };
            }
          }
        };
      }
    }),
    Color.extend({
      addAttributes() {
        return {
          color: {
            default: null,
            parseHTML: (element) => element.style.color || null,
            renderHTML: (attributes) => {
              if (!attributes.color) {
                return {};
              }
              return {
                style: `color: ${attributes.color}`
              };
            }
          }
        };
      }
    }),
    HardBreak.configure({ keepMarks: false }),
    Highlight.configure({ multicolor: true }),
    // Typography,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          return t('text_editor.placeholder.heading');
        }

        if (node.type.name === 'paragraph') {
          return t('text_editor.placeholder.write_something');
        }
        if (node.type.name.toLowerCase().includes('list')) {
          return t('text_editor.placeholder.list');
        }
        if (node.type.name === 'blockquote') {
          return t('text_editor.placeholder.blockquoate');
        }

        return t('text_editor.placeholder.write_something');
      }
    }),

    SuggestionMarks,
    ProofreadMarks,
    TextAlign.configure({
      types: ['heading', 'paragraph']
    }),
    Blockquote.configure({
      HTMLAttributes: {
        class: 'border-l-2 pl-4 border-muted-low'
      }
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https'],
      HTMLAttributes: {
        class: 'text-blue-600 underline'
      },
      isAllowedUri: (url, ctx) => {
        try {
          // construct URL
          const parsedUrl = url.includes(':')
            ? new URL(url)
            : new URL(`${ctx.defaultProtocol}://${url}`);

          // use default validation
          if (!ctx.defaultValidate(parsedUrl.href)) {
            return false;
          }

          // disallowed protocols
          const disallowedProtocols = ['ftp', 'file', 'mailto'];
          const protocol = parsedUrl.protocol.replace(':', '');

          if (disallowedProtocols.includes(protocol)) {
            return false;
          }

          // only allow protocols specified in ctx.protocols
          const allowedProtocols = ctx.protocols.map((p) => (typeof p === 'string' ? p : p.scheme));

          if (!allowedProtocols.includes(protocol)) {
            return false;
          }

          // disallowed domains
          const disallowedDomains = ['example-phishing.com', 'malicious-site.net'];
          const domain = parsedUrl.hostname;

          if (disallowedDomains.includes(domain)) {
            return false;
          }

          // all checks have passed
          return true;
        } catch (error) {
          return false;
        }
      },
      shouldAutoLink: (url) => {
        try {
          // construct URL
          const parsedUrl = url.includes(':') ? new URL(url) : new URL(`https://${url}`);

          // only auto-link if the domain is not in the disallowed list
          const disallowedDomains = ['example-no-autolink.com', 'another-no-autolink.com'];
          const domain = parsedUrl.hostname;

          return !disallowedDomains.includes(domain);
        } catch (error) {
          return false;
        }
      }
    }),
    BulletList.configure({
      HTMLAttributes: {
        class: 'pl-4 list-disc ml-1' // Add custom styles
      }
    }),
    OrderedList.configure({
      HTMLAttributes: {
        class: 'list-decimal pl-4 ml-1' // Add custom styles
      }
    }),
    CodeBlock.configure({
      HTMLAttributes: {
        class: 'bg-muted border my-2 py-2 px-3 rounded-md'
      }
    }),
    Heading,
    ExtendedFileHandler(draftId, onUploadInlineImage, onUploadAttachment),
    VariableExtension,
    LinkButtonExtension,
    PlainTextPasteExtension,
    EditorCommandExtension.configure({
      suggestion: {
        items: (props) =>
          getCommandSuggestions(props.query, {
            templates,
            onSelectTemplate
          }),
        render: EditorCommandList
      }
    })
  ];
};
