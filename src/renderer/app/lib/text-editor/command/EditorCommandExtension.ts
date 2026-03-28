import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Create plugin keys - make them exportable for coordination
export const SuggestionPluginKey = new PluginKey('editorCommandSuggestion');
export const CommandPluginKey = new PluginKey('editorCommand');

// Define type for range to prevent "property does not exist on type never" errors
interface CommandRange {
  from: number;
  to: number;
}

// Define the state interface to avoid type errors
interface CommandPluginState {
  active: boolean;
  range: CommandRange | null;
  decorationSet: DecorationSet;
}

// Define a type for the extension's this context
interface ExtensionContext {
  options: {
    suggestion: {
      char: string;
      startOfLine: boolean;
      command: ({ editor, range, props }: { editor: any; range: any; props: any }) => void;
      allowSpaces: boolean;
      matchOffset: number;
      isolating: boolean;
      pluginKey: PluginKey;
      menuHandler: any;
      onStart: (props: any) => void;
      onExit: (props: any) => void;
    };
  };
  editor: any;
}

const EditorCommandExtension = Extension.create({
  name: 'editorCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range, props });
        },
        // Only match when slash is at the beginning of a word
        allowSpaces: true,
        matchOffset: 0,
        isolating: true,
        pluginKey: SuggestionPluginKey,
        // Store for the menu handler
        menuHandler: null as any,
        // Custom handlers for tippy visibility state
        onStart: function (
          this: ExtensionContext,
          { editor, range, command, items, clientRect }: any
        ) {
          // Update command decoration active state
          editor.view.dispatch(
            editor.view.state.tr.setMeta(CommandPluginKey, {
              active: true,
              range
            })
          );

          // Then call the regular handler
          const menuHandler = this.options.suggestion.menuHandler;
          if (menuHandler) {
            menuHandler.onStart({
              editor,
              range,
              command,
              items,
              clientRect
            });
          }
        },
        onExit: function (this: ExtensionContext, { editor }: { editor: any }) {
          // Update command decoration inactive state
          editor.view.dispatch(
            editor.view.state.tr.setMeta(CommandPluginKey, {
              active: false,
              range: null
            })
          );

          // Then call the regular handler
          const menuHandler = this.options.suggestion.menuHandler;
          if (menuHandler) {
            menuHandler.onExit();
          }
        }
      }
    };
  },

  addProseMirrorPlugins() {
    // Store the original handler to allow coordination
    const menuHandler = this.editor.storage.editorCommand?.commandMenuHandler;

    // Set menuHandler in options so onStart/onExit can access it
    this.options.suggestion.menuHandler = menuHandler;

    // Create the suggestion plugin with our configured options
    const suggestPlugin = Suggestion({
      editor: this.editor,
      ...this.options.suggestion
    });

    // Add a plugin to highlight active commands only when the menu is active
    const decorationPlugin = new Plugin<CommandPluginState>({
      key: CommandPluginKey,
      state: {
        init(): CommandPluginState {
          return { active: false, range: null, decorationSet: DecorationSet.empty };
        },
        apply(tr, prev: CommandPluginState): CommandPluginState {
          // Check for explicit commands from the CommandList component
          const metadata = tr.getMeta(CommandPluginKey);

          if (metadata) {
            if (metadata.active && metadata.range) {
              const decoration = Decoration.inline(metadata.range.from, metadata.range.to, {
                class:
                  'bg-blue-100 dark:bg-blue-100/30 text-blue-700 dark:text-blue-100 rounded-md p-1'
              });

              return {
                active: true,
                range: metadata.range,
                decorationSet: DecorationSet.create(tr.doc, [decoration])
              };
            }

            if (metadata.active === false) {
              return {
                active: false,
                range: null,
                decorationSet: DecorationSet.empty
              };
            }
          }

          // If the document changed and we have an active decoration, update it
          if (tr.docChanged && prev.active && prev.range) {
            // Adjust the decoration position if needed
            const mappedFrom = tr.mapping.map(prev.range.from);
            const mappedTo = tr.mapping.map(prev.range.to);

            const decoration = Decoration.inline(mappedFrom, mappedTo, {
              class:
                'bg-blue-100 dark:bg-blue-100/30 text-blue-700 dark:text-blue-100 rounded-md p-1'
            });

            return {
              active: true,
              range: { from: mappedFrom, to: mappedTo },
              decorationSet: DecorationSet.create(tr.doc, [decoration])
            };
          }

          // If the document changed but no suggestion state change, map decorations
          if (tr.docChanged) {
            return {
              ...prev,
              decorationSet: prev.decorationSet.map(tr.mapping, tr.doc)
            };
          }

          return prev;
        }
      },
      props: {
        decorations(state) {
          const pluginState = this.getState(state);
          return pluginState ? pluginState.decorationSet : DecorationSet.empty;
        }
      }
    });

    return [suggestPlugin, decorationPlugin];
  }
});

export default EditorCommandExtension;
