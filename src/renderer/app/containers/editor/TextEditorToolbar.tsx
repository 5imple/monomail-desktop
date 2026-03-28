import MonoIcon from '@/renderer/app/components/icons/icons';
import { Popover, PopoverContent } from '@/renderer/app/components/ui/popover';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Toggle, toggleVariants } from '@/renderer/app/components/ui/toggle';
import { cn } from '@/renderer/app/lib/utils';
import { PopoverTrigger } from '@radix-ui/react-popover';
import { type Editor } from '@tiptap/react';
import { useState } from 'react';

const TextEditorToolbar = ({ editor, className }: { editor: Editor; className?: string }) => {
  const [isTextColorPickerOpen, setIsTextColorPickerOpen] = useState(false);
  const [isBackgroundColorPickerOpen, setIsBackgroundColorPickerOpen] = useState(false);

  const handleTextAlign = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    editor.chain().focus().setTextAlign(alignment).run();
  };

  const handleColorChange = (type: 'background' | 'text', color: string) => {
    if (type === 'background') {
      editor.chain().focus().setHighlight({ color }).run();
      setIsBackgroundColorPickerOpen(false);
    } else {
      editor.chain().focus().setColor(color).run();
      setIsTextColorPickerOpen(false);
    }
  };
  const colors = [
    // Neutral Colors
    '#000000',
    '#424242',
    '#757575',
    '#BDBDBD',
    '#E0E0E0',
    '#FFFFFF',
    // Primary Bright Colors
    '#EA4335',
    '#FBBC05',
    '#34A853',
    '#00C4FF',
    '#4285F4',
    '#AA00FF',
    // Pastel Shades (Rows of lighter variations)
    '#FCE8E6',
    '#FEEFC3',
    '#E6F4EA',
    '#E1F5FE',
    '#E8F0FE',
    '#F3E8FD',
    '#F4CCCC',
    '#FFF2CC',
    '#D9EAD3',
    '#D0E0E3',
    '#C9DAF8',
    '#D9D2E9',
    '#EA9999',
    '#FFD966',
    '#93C47D',
    '#76A5AF',
    '#6D9EEB',
    '#8E7CC3',
    '#CC0000',
    '#E69138',
    '#6AA84F',
    '#45818E',
    '#3C78D8',
    '#674EA7',
    '#990000',
    '#B45F06',
    '#38761D',
    '#134F5C',
    '#1155CC',
    '#351C75',
    // Dark Tones
    '#660000',
    '#783F04',
    '#274E13',
    '#0C343D',
    '#1C4587',
    '#20124D'
  ];

  return (
    <div
      className={`pointer-events-auto relative z-10 p-0 ${
        className || 'flex flex-row items-center gap-1'
      }`}
    >
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
      >
        <MonoIcon type="Bold" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      >
        <MonoIcon type="Italic" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
      >
        <MonoIcon type="Strikethrough" className="h-4 w-4" />
      </Toggle>
      <Separator orientation="vertical" className="h-6 w-[1px]" />

      <Popover open={isTextColorPickerOpen} onOpenChange={setIsTextColorPickerOpen}>
        <PopoverTrigger asChild>
          <Toggle
            sizeVariant={'sm'}
            variant={'accent'}
            onClick={(e) => {
              setIsTextColorPickerOpen((prev) => !prev);
            }}
          >
            <MonoIcon type="TextBaseline" className="h-4 w-4" />
          </Toggle>
        </PopoverTrigger>

        <PopoverContent className="w-fit p-1" side={'top'} onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-6 gap-0.5">
            {colors.map((color) => (
              <div
                key={color}
                className="h-5 w-5 rounded-sm border border-border/50 shadow-sm"
                style={{ backgroundColor: color }}
                onClick={() => handleColorChange('text', color)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={isBackgroundColorPickerOpen} onOpenChange={setIsBackgroundColorPickerOpen}>
        <PopoverTrigger asChild>
          <Toggle
            sizeVariant={'sm'}
            variant={'accent'}
            onClick={(e) => {
              setIsBackgroundColorPickerOpen((prev) => !prev);
            }}
          >
            <MonoIcon type="Highlighter" className="h-4 w-4" />
          </Toggle>
        </PopoverTrigger>

        <PopoverContent className="w-fit p-1" side={'top'} onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-6 gap-0.5">
            {colors.map((color) => (
              <div
                key={color}
                className="h-5 w-5 rounded-sm border border-border/50 shadow-sm"
                style={{ backgroundColor: color }}
                onClick={() => handleColorChange('background', color)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Separator orientation="vertical" className="h-6 w-[1px]" />

      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
      >
        <MonoIcon type="List" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <MonoIcon type="ListOrdered" className="h-4 w-4" />
      </Toggle>
      <Separator orientation="vertical" className="h-6 w-[1px]" />

      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'justify' })}
        onPressedChange={() => handleTextAlign('justify')}
      >
        <MonoIcon type="AlignJustify" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'left' })}
        onPressedChange={() => handleTextAlign('left')}
      >
        <MonoIcon type="AlignLeft" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'center' })}
        onPressedChange={() => handleTextAlign('center')}
      >
        <MonoIcon type="AlignCenter" className="h-4 w-4" />
      </Toggle>
      <Toggle
        sizeVariant={'sm'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'right' })}
        onPressedChange={() => handleTextAlign('right')}
      >
        <MonoIcon type="AlignRight" className="h-4 w-4" />
      </Toggle>
    </div>
  );
};
export default TextEditorToolbar;
