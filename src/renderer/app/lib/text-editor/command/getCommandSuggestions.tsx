import { Editor } from '@tiptap/core';
import { IMonoTemplate } from '@/main/api/template/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { ReactNode } from 'react';

interface GetCommandSuggestionsOptions {
  templates: IMonoTemplate[];
  onSelectTemplate?: (template: IMonoTemplate) => void;
}

// Define command categories
const COMMAND_CATEGORIES = {
  FORMAT: 'Format',
  TEXT_COLOR: 'Text Color',
  HIGHLIGHT: 'Highlight Color',
  LIST: 'Lists',
  ALIGN: 'Alignment',
  TEMPLATE: 'Templates'
};

// Command type definition
interface CommandItem {
  title: string;
  description?: string;
  icon?: string;
  category: string;
  template?: IMonoTemplate;
  element?: ReactNode;
  command: (props: any) => void;
}

const getCommandSuggestions = (
  query: string,
  { templates, onSelectTemplate }: GetCommandSuggestionsOptions
) => {
  // Ensure query is a string
  const searchQuery = typeof query === 'string' ? query.toLowerCase() : '';

  // Define formatting commands
  const formattingCommands: CommandItem[] = [
    {
      title: 'Bold',
      // description: 'Make text bold',
      icon: 'Bold',
      category: COMMAND_CATEGORIES.FORMAT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBold().run();
      }
    },
    {
      title: 'Italic',
      // description: 'Make text italic',
      icon: 'Italic',
      category: COMMAND_CATEGORIES.FORMAT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleItalic().run();
      }
    },
    {
      title: 'Strike',
      // description: 'Strikethrough text',
      icon: 'Strikethrough',
      category: COMMAND_CATEGORIES.FORMAT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleStrike().run();
      }
    }
  ];

  // Define text color commands
  const textColorCommands: CommandItem[] = [
    {
      title: 'Black',
      // description: 'Set text color to black',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#000000').run();
      }
    },
    {
      title: 'Dark Gray',
      // description: 'Set text color to dark gray',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#424242').run();
      }
    },
    {
      title: 'Gray',
      // description: 'Set text color to gray',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#757575').run();
      }
    },
    {
      title: 'Light Gray',
      // description: 'Set text color to light gray',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#BDBDBD').run();
      }
    },
    {
      title: 'White',
      // description: 'Set text color to white',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#FFFFFF').run();
      }
    },
    {
      title: 'Red',
      // description: 'Set text color to red',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#EA4335').run();
      }
    },
    {
      title: 'Yellow',
      // description: 'Set text color to yellow',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#FBBC05').run();
      }
    },
    {
      title: 'Green',
      // description: 'Set text color to green',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#34A853').run();
      }
    },
    {
      title: 'Blue',
      // description: 'Set text color to blue',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#4285F4').run();
      }
    },
    {
      title: 'Purple',
      // description: 'Set text color to purple',
      icon: 'TextBaseline',
      category: COMMAND_CATEGORIES.TEXT_COLOR,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setColor('#AA00FF').run();
      }
    }
  ];

  // Define highlight color commands
  const highlightCommands: CommandItem[] = [
    {
      title: 'Yellow Highlight',
      // description: 'Highlight text with yellow',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#FEEFC3' }).run();
      }
    },
    {
      title: 'Red Highlight',
      // description: 'Highlight text with red',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#FCE8E6' }).run();
      }
    },
    {
      title: 'Green Highlight',
      // description: 'Highlight text with green',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#E6F4EA' }).run();
      }
    },
    {
      title: 'Blue Highlight',
      // description: 'Highlight text with blue',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#E8F0FE' }).run();
      }
    },
    {
      title: 'Purple Highlight',
      // description: 'Highlight text with purple',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#F3E8FD' }).run();
      }
    },
    {
      title: 'Orange Highlight',
      // description: 'Highlight text with orange',
      icon: 'Highlighter',
      category: COMMAND_CATEGORIES.HIGHLIGHT,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHighlight({ color: '#FEF7E0' }).run();
      }
    }
  ];

  // Define list commands
  const listCommands: CommandItem[] = [
    {
      title: 'Bullet List',
      // description: 'Create a bullet list',
      icon: 'List',
      category: COMMAND_CATEGORIES.LIST,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      }
    },
    {
      title: 'Numbered List',
      // description: 'Create a numbered list',
      icon: 'ListOrdered',
      category: COMMAND_CATEGORIES.LIST,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      }
    }
  ];

  // Define alignment commands
  const alignmentCommands: CommandItem[] = [
    {
      title: 'Align Left',
      // description: 'Align text to the left',
      icon: 'AlignLeft',
      category: COMMAND_CATEGORIES.ALIGN,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setTextAlign('left').run();
      }
    },
    {
      title: 'Align Center',
      // description: 'Align text to the center',
      icon: 'AlignCenter',
      category: COMMAND_CATEGORIES.ALIGN,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setTextAlign('center').run();
      }
    },
    {
      title: 'Align Right',
      // description: 'Align text to the right',
      icon: 'AlignRight',
      category: COMMAND_CATEGORIES.ALIGN,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setTextAlign('right').run();
      }
    },
    {
      title: 'Justify',
      // description: 'Justify text alignment',
      icon: 'AlignJustify',
      category: COMMAND_CATEGORIES.ALIGN,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setTextAlign('justify').run();
      }
    }
  ];

  // Map templates to command items
  const templateCommands: CommandItem[] = templates.map((template) => ({
    title: template.name,
    description: getPlainTextSnippet(template.body, 100),
    icon: template.icon,
    category: COMMAND_CATEGORIES.TEMPLATE,
    template,
    command: ({ editor, range }: { editor: Editor; range: any }) => {
      // Delete the slash command
      editor.chain().focus().deleteRange(range).run();

      // Handle template selection
      if (onSelectTemplate) {
        onSelectTemplate(template);
      } else {
        // Default behavior: insert template body
        editor.chain().focus().insertContent(template.body).run();
      }
    }
  }));

  // Combine all commands
  const allCommands = [
    ...templateCommands,
    ...formattingCommands,
    ...textColorCommands,
    ...highlightCommands,
    ...listCommands,
    ...alignmentCommands
  ];

  // Filter based on search query
  const filteredCommands = allCommands.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery) ||
      (item.description && item.description.toLowerCase().includes(searchQuery)) ||
      item.category.toLowerCase().includes(searchQuery)
  );

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, command) => {
    const { category } = command;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(command);
    return acc;
  }, {});

  // Don't flatten - return the filtered commands directly
  // This allows the CommandsList to handle categorization and display
  const result = filteredCommands;

  return result; // Return all results without limiting
};

// Helper function to get plain text from HTML
function getPlainTextSnippet(html: string, length: number = 100): string {
  if (typeof document === 'undefined') return html.slice(0, length);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent?.slice(0, length) || '';
}

export default getCommandSuggestions;
