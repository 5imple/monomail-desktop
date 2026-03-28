import EditorCommandListItem, {
  EditorCommandListItemProps
} from '@/renderer/app/lib/text-editor/command/EditorCommandListItem';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance, Props } from 'tippy.js';
import { CommandPluginKey } from './EditorCommandExtension';

// Add an interface to properly type the ref
interface CommandsListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Define a type for command categories
type CommandCategory = string;

// Define a type for command items
interface CommandItem {
  category?: CommandCategory;
  title: string;
  command: (props: any) => void;
  [key: string]: any;
}

const EditorCommandList = () => {
  let component: ReactRenderer | null = null;
  let popup: Instance<Props>[] | null = null;
  let currentEditor = null;
  let currentRange = null;

  const setDecorationState = (editor, active, range = null) => {
    if (!editor) return;

    // Dispatch transaction to update decoration state
    editor.view.dispatch(
      editor.view.state.tr.setMeta(CommandPluginKey, {
        active,
        range
      })
    );
  };

  return {
    onStart: (props: {
      items: CommandItem[];
      clientRect: () => DOMRect;
      editor: any;
      range: any;
    }) => {
      const hasItems = props.items && props.items.length > 0;
      const commandCategories = hasItems
        ? ([
            ...new Set(props.items.map((item) => item.category).filter(Boolean))
          ] as CommandCategory[])
        : [];

      // Store current editor and range
      currentEditor = props.editor;
      currentRange = props.range;

      // Determine appropriate label based on contents
      let label = '';
      if (commandCategories.length === 1 && commandCategories[0]) {
        label = commandCategories[0];
      }

      component = new ReactRenderer(EditorCommandListItem, {
        props: {
          ...props,
          label: hasItems ? label : undefined,
          command: (item: CommandItem) => {
            if (item && item.command && popup && popup.length > 0) {
              item.command(props);
            }
          }
        },
        editor: props.editor
      });

      popup = tippy('body', {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        arrow: false,
        trigger: 'manual',
        placement: 'bottom-start',
        theme: 'mono',
        maxWidth: '400px',
        duration: 150,
        animation: 'shift-toward-subtle',
        onShow: (instance) => {
          // Add dark class to tippy box
          instance.popper.classList.add('dark');
          // Set decoration active when tippy shows
          setDecorationState(currentEditor, true, currentRange);
        },
        onHide: (instance) => {
          // Remove dark class from tippy box
          // instance.popper.classList.remove('dark');
          // Set decoration inactive when tippy hides
          setDecorationState(currentEditor, false);
        }
      });
    },

    onUpdate(props: { items: CommandItem[]; clientRect: () => DOMRect; editor: any; range: any }) {
      if (!component || !popup) return;

      // Update current editor and range
      currentEditor = props.editor;
      currentRange = props.range;

      const hasItems = props.items && props.items.length > 0;
      const commandCategories = hasItems
        ? ([
            ...new Set(props.items.map((item) => item.category).filter(Boolean))
          ] as CommandCategory[])
        : [];

      // Determine appropriate label based on contents
      let label = '';
      if (commandCategories.length === 1 && commandCategories[0]) {
        label = commandCategories[0];
      }

      component.updateProps({
        ...props,
        label: hasItems ? label : undefined
      });

      popup[0].setProps({
        getReferenceClientRect: props.clientRect
      });

      // Update decoration with new range
      setDecorationState(currentEditor, true, currentRange);
    },

    onKeyDown(props: { event: KeyboardEvent }) {
      if (!popup) return false;

      if (props.event.key === 'Escape') {
        // Set decoration inactive
        setDecorationState(currentEditor, false);

        if (popup) {
          popup[0].destroy();
          popup = null;
        }

        if (component) {
          component.destroy();
          component = null;
        }
        return true;
      }

      // Access the ref with proper typing
      const commandsListRef = component?.ref as CommandsListRef;
      const result = commandsListRef?.onKeyDown ? commandsListRef.onKeyDown(props) : false;

      // If we have an empty list and Enter was pressed, hide the popup like Escape
      if (result && props.event.key === 'Enter') {
        const items = (component && (component?.props as EditorCommandListItemProps))?.items || [];
        if (items.length === 0) {
          // Set decoration inactive
          setDecorationState(currentEditor, false);

          if (popup) {
            popup[0].destroy();
            popup = null;
          }

          if (component) {
            component.destroy();
            component = null;
          }
        }
      }

      return result;
    },

    onExit() {
      // Set decoration inactive
      setDecorationState(currentEditor, false);

      if (popup) {
        popup[0].destroy();
        popup = null;
      }

      if (component) {
        component.destroy();
        component = null;
      }
    }
  };
};

export default EditorCommandList;
