import MonoIcon from '@/renderer/app/components/icons/icons';
import { Popover, PopoverContent } from '@/renderer/app/components/ui/popover';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Toggle } from '@/renderer/app/components/ui/toggle';
import { isMac } from '@/renderer/app/lib/platform';
import { PopoverTrigger } from '@radix-ui/react-popover';
import { type Editor, useEditorState } from '@tiptap/react';
import { useState } from 'react';

// What the toolbar shows from the editor. The editor no longer re-renders its
// children on every transaction, so the toolbar re-renders itself when one of
// these changes (and only then).
const toolbarStateKey = (editor: Editor): string =>
  [
    editor.isActive('bold'),
    editor.isActive('italic'),
    editor.isActive('strike'),
    editor.isActive('bulletList'),
    editor.isActive('orderedList'),
    editor.isActive({ textAlign: 'left' }),
    editor.isActive({ textAlign: 'center' }),
    editor.isActive({ textAlign: 'right' }),
    editor.isActive({ textAlign: 'justify' }),
    editor.getAttributes('textStyle').color ?? '',
    editor.getAttributes('highlight').color ?? ''
  ].join('|');
import { useTranslation } from 'react-i18next';

// "Bold (⌘B)" / "Bold (Ctrl+B)" — TipTap's own shortcuts for each control.
const withShortcut = (label: string, keys: string[]) => {
  const shortcut = isMac
    ? keys.map((key) => (key === 'Mod' ? '⌘' : key === 'Shift' ? '⇧' : key)).join('')
    : keys.map((key) => (key === 'Mod' ? 'Ctrl' : key)).join('+');
  return `${label} (${shortcut})`;
};

// A "no colour" swatch: an empty square struck through.
const NoColorSwatch = () => (
  <span
    aria-hidden
    className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-border bg-background"
  >
    <span className="absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-destructive" />
  </span>
);

const TextEditorToolbar = ({ editor, className }: { editor: Editor; className?: string }) => {
  const { t } = useTranslation();
  useEditorState({ editor, selector: ({ editor: current }) => toolbarStateKey(current) });
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
  // Back to the default: picking a near-match colour was the only way out.
  const handleColorReset = (type: 'background' | 'text') => {
    if (type === 'background') {
      editor.chain().focus().unsetHighlight().run();
      setIsBackgroundColorPickerOpen(false);
    } else {
      editor.chain().focus().unsetColor().run();
      setIsTextColorPickerOpen(false);
    }
  };
  const textColor: string | undefined = editor.getAttributes('textStyle').color;
  const highlightColor: string | undefined = editor.getAttributes('highlight').color;

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

  // Labels via aria-label + native title: Radix tooltips would portal out of
  // the tippy BubbleMenu and could close it.
  const label = (text: string, keys?: string[]) => {
    const full = keys ? withShortcut(text, keys) : text;
    return { 'aria-label': full, title: full };
  };

  // The trigger's current colour, as a bar under its icon.
  const colorBar = (color?: string) =>
    color ? (
      <span
        aria-hidden
        className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
        style={{ background: color }}
      />
    ) : null;

  return (
    <div
      className={`pointer-events-auto relative z-10 p-0 ${
        className || 'flex flex-row items-center gap-0.5'
      }`}
    >
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        {...label(t('text_editor.toolbar.bold'), ['Mod', 'B'])}
      >
        <MonoIcon type="Bold" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        {...label(t('text_editor.toolbar.italic'), ['Mod', 'I'])}
      >
        <MonoIcon type="Italic" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        {...label(t('text_editor.toolbar.strikethrough'), ['Mod', 'Shift', 'S'])}
      >
        <MonoIcon type="Strikethrough" className="h-3.5 w-3.5" />
      </Toggle>
      <Separator orientation="vertical" className="mx-0.5 h-5 w-[1px] bg-border/60" />

      <Popover open={isTextColorPickerOpen} onOpenChange={setIsTextColorPickerOpen}>
        <PopoverTrigger asChild>
          <Toggle
            sizeVariant={'xs'}
            variant={'accent'}
            className="relative"
            onClick={(e) => {
              setIsTextColorPickerOpen((prev) => !prev);
            }}
            {...label(t('text_editor.toolbar.text_color'))}
          >
            <MonoIcon type="TextBaseline" className="h-3.5 w-3.5" />
            {colorBar(textColor)}
          </Toggle>
        </PopoverTrigger>

        <PopoverContent
          className="w-fit border-border/60 p-2"
          side={'top'}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('text_editor.toolbar.text_color')}
          </p>
          <button
            type="button"
            className="mb-1.5 flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => handleColorReset('text')}
          >
            <NoColorSwatch />
            {t('text_editor.toolbar.default_color')}
          </button>
          <div className="grid grid-cols-6 gap-0.5">
            {colors.map((color) => (
              <button
                type="button"
                aria-label={t('text_editor.toolbar.set_text_color', { color })}
                key={color}
                className="h-5 w-5 cursor-pointer rounded-sm border border-border/60 transition-transform hover:scale-110"
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
            sizeVariant={'xs'}
            variant={'accent'}
            className="relative"
            onClick={(e) => {
              setIsBackgroundColorPickerOpen((prev) => !prev);
            }}
            {...label(t('text_editor.toolbar.highlight'), ['Mod', 'Shift', 'H'])}
          >
            <MonoIcon type="Highlighter" className="h-3.5 w-3.5" />
            {colorBar(highlightColor)}
          </Toggle>
        </PopoverTrigger>

        <PopoverContent
          className="w-fit border-border/60 p-2"
          side={'top'}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('text_editor.toolbar.highlight')}
          </p>
          <button
            type="button"
            className="mb-1.5 flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => handleColorReset('background')}
          >
            <NoColorSwatch />
            {t('text_editor.toolbar.no_highlight')}
          </button>
          <div className="grid grid-cols-6 gap-0.5">
            {colors.map((color) => (
              <button
                type="button"
                aria-label={t('text_editor.toolbar.set_highlight', { color })}
                key={color}
                className="h-5 w-5 cursor-pointer rounded-sm border border-border/60 transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                onClick={() => handleColorChange('background', color)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Separator orientation="vertical" className="mx-0.5 h-5 w-[1px] bg-border/60" />

      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        {...label(t('text_editor.toolbar.bullet_list'), ['Mod', 'Shift', '8'])}
      >
        <MonoIcon type="List" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        {...label(t('text_editor.toolbar.numbered_list'), ['Mod', 'Shift', '7'])}
      >
        <MonoIcon type="ListOrdered" className="h-3.5 w-3.5" />
      </Toggle>
      <Separator orientation="vertical" className="mx-0.5 h-5 w-[1px] bg-border/60" />

      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'left' })}
        onPressedChange={() => handleTextAlign('left')}
        {...label(t('text_editor.toolbar.align_left'), ['Mod', 'Shift', 'L'])}
      >
        <MonoIcon type="AlignLeft" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'center' })}
        onPressedChange={() => handleTextAlign('center')}
        {...label(t('text_editor.toolbar.align_center'), ['Mod', 'Shift', 'E'])}
      >
        <MonoIcon type="AlignCenter" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'right' })}
        onPressedChange={() => handleTextAlign('right')}
        {...label(t('text_editor.toolbar.align_right'), ['Mod', 'Shift', 'R'])}
      >
        <MonoIcon type="AlignRight" className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        sizeVariant={'xs'}
        variant={'accent'}
        pressed={editor.isActive({ textAlign: 'justify' })}
        onPressedChange={() => handleTextAlign('justify')}
        {...label(t('text_editor.toolbar.justify'), ['Mod', 'Shift', 'J'])}
      >
        <MonoIcon type="AlignJustify" className="h-3.5 w-3.5" />
      </Toggle>
    </div>
  );
};
export default TextEditorToolbar;
