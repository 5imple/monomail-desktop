import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import tippy from 'tippy.js';

// Variable regex pattern - matches {variable_name}
const variablePattern = /\{([^{}]+)\}/g;

// Type for variable position
interface VariablePosition {
  start: number;
  end: number;
}

// Type for variable preview
interface VariablePreview {
  start: number;
  end: number;
  value: string;
}

// Extension to detect and highlight variables
export const VariableExtension = Extension.create({
  name: 'variables',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('variables');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text || '';
                let match;
                variablePattern.lastIndex = 0; // Reset regex

                while ((match = variablePattern.exec(text)) !== null) {
                  const start = pos + match.index;
                  const end = start + match[0].length;
                  const variableName = match[1];

                  // Create a widget decoration to render our button
                  decorations.push(
                    Decoration.widget(
                      start,
                      (view, getPos) => {
                        // Create button element
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = `{${variableName}}`;
                        // --accent is a near-white neutral (an invisible chip);
                        // muted + a hairline ring reads in every theme.
                        button.className =
                          'variable-button rounded bg-muted px-1 text-sm text-foreground ring-1 ring-border hover:bg-muted-low focus:outline-none focus-visible:ring-2';

                        // Store position data as attributes
                        button.setAttribute('data-variable', variableName);
                        button.setAttribute('data-start', start.toString());
                        button.setAttribute('data-end', end.toString());

                        // Add click event directly to the button
                        button.addEventListener('mousedown', (e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          // Create a custom event with the variable data
                          const event = new CustomEvent('variable-click', {
                            detail: {
                              variable: variableName,
                              start,
                              end,
                              button,
                              view
                            },
                            bubbles: true
                          });

                          // Dispatch the event on the button
                          button.dispatchEvent(event);
                        });

                        return button;
                      },
                      { side: -1 }
                    )
                  );

                  // Add a deletion decoration to hide the original text
                  decorations.push(
                    Decoration.inline(start, end, {
                      class: 'variable-text-hidden'
                    })
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});

// Enhanced Plugin for handling variable previews with better styling
export const VariablePreviewPlugin = () => {
  interface PluginState {
    preview: VariablePreview | null;
  }

  return new Plugin<PluginState>({
    key: new PluginKey('variable-preview'),
    state: {
      init(): PluginState {
        return {
          preview: null
        };
      },
      apply(tr, prev) {
        const preview = tr.getMeta('variable-preview') as VariablePreview | null;
        if (preview === undefined) return prev;
        return { preview };
      }
    },
    props: {
      decorations(state) {
        const pluginState = this.getState(state);
        if (!pluginState || !pluginState.preview) return null;

        const { start, end, value } = pluginState.preview;

        return DecorationSet.create(state.doc, [
          // Use two decorations to achieve the effect:
          // 1. A widget decoration to show the preview
          Decoration.widget(start, () => {
            const span = document.createElement('span');
            span.textContent = value || '';
            span.className =
              'variable-preview inline-block rounded bg-muted px-1 py-0.5 text-foreground ring-1 ring-border';
            return span;
          }),
          // 2. An inline decoration to hide the original text
          Decoration.inline(start, end, {
            class: 'variable-text-hidden'
          })
        ]);
      }
    }
  });
};

// Component for the Tippy popover content
interface VariablePopoverContentProps {
  variableValue: string;
  setVariableValue: (value: string) => void;
  currentVariable: string;
  applyChange: () => void;
}

const VariablePopoverContent: React.FC<VariablePopoverContentProps> = ({
  variableValue,
  setVariableValue,
  currentVariable,
  applyChange
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when the popover opens
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 150);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyChange();
    }
  };

  return (
    <div className="">
      <div className="flex items-center px-1">
        <Input
          ref={inputRef}
          value={variableValue}
          variant={'transparent'}
          onChange={(e) => setVariableValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-[200px] text-sm"
          placeholder={t('text_editor.variable.replace', { name: currentVariable })}
          autoFocus
        />
        <div className="flex space-x-1">
          <Button
            disabled={!variableValue.trim()}
            sizeVariant={'sm'}
            typeVariant={'icon'}
            variant={'secondary'}
            onClick={applyChange}
            aria-label={t('text_editor.variable.apply')}
          >
            <MonoIcon type="Check" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Type for the ref to access methods from the React component
interface VariablePopoverRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// Editor Variable Popover Component with Tippy integration
interface VariableEditorPopoverProps {
  editor: any; // You might want to use a more specific type here
}

export const VariableEditorPopover: React.FC<VariableEditorPopoverProps> = ({ editor }) => {
  // Add custom CSS to document for variable styling
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .variable-text-hidden {
        display: none;
      }
      .variable-preview {
        transition: background-color 0.2s ease;
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Listen for variable clicks
  useEffect(() => {
    if (!editor) return;

    let component: ReactRenderer | null = null;
    let popup: any = null;
    let currentVariablePos: VariablePosition | null = null;

    const handleVariableClick = (event: CustomEvent) => {
      const { variable, start, end, button, view } = event.detail;

      // Store the current variable position
      currentVariablePos = { start, end };

      // Clean up any existing popup
      if (popup) {
        popup[0].destroy();
        popup = null;
      }

      if (component) {
        component.destroy();
        component = null;
      }

      // Function to show the preview in the editor
      const showPreview = (value: string) => {
        if (!currentVariablePos) return;

        const { tr } = editor.state;
        tr.setMeta('variable-preview', {
          start: currentVariablePos.start,
          end: currentVariablePos.end,
          value
        });
        editor.view.dispatch(tr);
      };

      // Function to clear the preview
      const clearPreview = () => {
        const { tr } = editor.state;
        tr.setMeta('variable-preview', null);
        editor.view.dispatch(tr);
      };

      // Function to apply the variable change
      const applyChange = (value: string) => {
        if (!currentVariablePos) return;
        // An empty value would be an empty text node, which ProseMirror
        // throws on (Enter bypassed the disabled Apply button).
        if (!value.trim()) return;

        // Fill every {variable} with the same name at once — a template
        // using {first_name} twice needed two separate edits. Applied from
        // the end so earlier positions stay valid.
        const token = `{${variable}}`;
        const ranges: Array<{ from: number; to: number }> = [];
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          let index = node.text.indexOf(token);
          while (index !== -1) {
            ranges.push({ from: pos + index, to: pos + index + token.length });
            index = node.text.indexOf(token, index + token.length);
          }
        });
        if (ranges.length === 0) {
          ranges.push({ from: currentVariablePos.start, to: currentVariablePos.end });
        }

        const { tr } = editor.state;
        ranges
          .sort((a, b) => b.from - a.from)
          .forEach(({ from, to }) => {
            tr.insertText(value, from, to);
          });
        editor.view.dispatch(tr);

        // Clean up
        clearPreview();
        popup[0].hide();
        editor.commands.focus();
      };

      // Initial variable value
      let variableValue = '';

      // Create the React component
      component = new ReactRenderer(VariablePopoverContent, {
        props: {
          variableValue,
          setVariableValue: (value) => {
            variableValue = value;
            showPreview(value);

            // Update the component props
            component?.updateProps({
              variableValue: value,
              setVariableValue: (v) => {
                variableValue = v;
                showPreview(v);
                component?.updateProps({
                  variableValue: v,
                  currentVariable: variable,
                  applyChange: () => applyChange(v)
                });
              },
              currentVariable: variable,
              applyChange: () => applyChange(value)
            });
          },
          currentVariable: variable,
          applyChange: () => applyChange(variableValue)
        },
        editor
      });

      // Set up the keyboard event handling
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          popup[0].hide();
          return true;
        }
        return false;
      };

      // Create the Tippy instance. The 'mono' theme follows the app theme
      // (it used to force a dark popover onto the light compose).
      popup = tippy('body', {
        getReferenceClientRect: () => button.getBoundingClientRect(),
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
        theme: 'mono',
        onHide: () => {
          clearPreview();
          // Every click adds a listener; drop it as soon as this one hides.
          document.removeEventListener('keydown', handleKeyDown);
        },
        onDestroy: () => {
          document.removeEventListener('keydown', handleKeyDown);
          if (component) {
            component.destroy();
            component = null;
          }
        }
      });

      // Attach the event handler
      document.addEventListener('keydown', handleKeyDown);
    };

    // Listen for our custom variable-click event on the editor DOM
    editor.view.dom.addEventListener('variable-click', handleVariableClick);

    return () => {
      // Clean up
      editor.view.dom.removeEventListener('variable-click', handleVariableClick);
    };
  }, [editor]);

  // We don't need to render anything directly
  return null;
};
