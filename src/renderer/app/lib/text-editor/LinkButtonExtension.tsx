import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import { Label } from '@/renderer/app/components/ui/label';
import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import React, { useEffect, useRef, useState } from 'react';
import tippy from 'tippy.js';

// Extension to transform links into interactive buttons with proper deletion support
export const LinkButtonExtension = Extension.create({
  name: 'linkButton',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('linkButtons');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];

            // Check if we're in a transaction or selection that should disable decorations
            const editorDisabled = false; // Set this based on editor state if needed

            // Find all links in the document
            doc.descendants((node, pos) => {
              const linkMarks = node.marks?.filter((mark) => mark.type.name === 'link') || [];

              if (node.isText && linkMarks.length > 0 && !editorDisabled) {
                // We've found a text node with a link mark
                const text = node.text || '';
                const linkMark = linkMarks[0]; // Get the first link mark
                const href = linkMark.attrs.href || '';

                // Skip decoration if we're editing this link (cursor inside it)
                const nodePosEnd = pos + text.length;
                const isCurrentlyEditing =
                  selection.from >= pos && selection.from <= nodePosEnd && selection.empty;

                // If we're currently editing this specific link, don't apply decorations
                if (isCurrentlyEditing) {
                  return;
                }

                try {
                  // Create a widget decoration to render our link button
                  decorations.push(
                    Decoration.widget(
                      pos,
                      (view, getPos) => {
                        try {
                          // Create button element
                          const button = document.createElement('button');
                          button.type = 'button';
                          button.innerHTML = text.replace(/ +/g, (match) =>
                            '&nbsp;'.repeat(match.length)
                          );
                          button.className =
                            'link-button text-blue-600 underline focus:outline-none focus-visible:ring-2 text-start';

                          // Store position data and href as attributes
                          button.setAttribute('data-href', href);
                          button.setAttribute('data-start', pos.toString());
                          button.setAttribute('data-end', (pos + text.length).toString());

                          // Add click event directly to the button
                          button.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Create a custom event with the link data
                            const event = new CustomEvent('link-button-click', {
                              detail: {
                                href,
                                text,
                                start: pos,
                                end: pos + text.length,
                                button,
                                view
                              },
                              bubbles: true
                            });

                            // Dispatch the event on the button
                            button.dispatchEvent(event);
                          });

                          return button;
                        } catch (error) {
                          console.error('Error creating button:', error);
                          const fallback = document.createElement('span');
                          fallback.innerHTML = text.replace(/ +/g, (match) =>
                            '&nbsp;'.repeat(match.length)
                          );
                          fallback.className = 'text-blue-600 underline';
                          return fallback;
                        }
                      },
                      { side: -1 }
                    )
                  );

                  // Add a deletion decoration to hide the original text + link
                  decorations.push(
                    Decoration.inline(pos, pos + text.length, {
                      class: 'link-text-hidden'
                    })
                  );
                } catch (error) {
                  console.error('Error creating decoration:', error);
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },

          // Handle key press to enable proper deletion of links
          // Modified handleKeyDown function for the LinkButtonExtension
          handleKeyDown(view, event) {
            // Check if we're pressing backspace or delete key
            if (event.key === 'Backspace' || event.key === 'Delete') {
              const { state } = view;
              const { selection, doc } = state;

              // Check if the selection is at the edge of or inside a link
              if (selection.empty) {
                const $pos = doc.resolve(selection.from);
                const marks = $pos.marks();
                const hasLinkMark = marks.some((mark) => mark.type.name === 'link');

                if (hasLinkMark) {
                  // Check if we're at the start of the link text (for backspace, need special handling)
                  if (event.key === 'Backspace') {
                    // Find the start and end positions of the current link
                    let linkStart = selection.from;
                    let linkEnd = selection.from;

                    // Find the start of the link
                    while (linkStart > 0) {
                      const markAt = doc.rangeHasMark(
                        linkStart - 1,
                        linkStart,
                        state.schema.marks.link
                      );
                      if (!markAt) break;
                      linkStart--;
                    }

                    // Find the end of the link
                    while (linkEnd < doc.content.size) {
                      const markAt = doc.rangeHasMark(linkEnd, linkEnd, state.schema.marks.link);
                      if (!markAt) break;
                      linkEnd++;
                    }

                    // If cursor is at the beginning of link text and user presses backspace
                    // Let normal deletion occur, but we'll monitor for empty links
                    const tr = state.tr;
                    tr.delete(selection.from - 1, selection.from);

                    // Check if this would result in an empty link
                    if (linkStart + 1 >= linkEnd) {
                      // Link will be empty after deletion, so remove the link entirely
                      tr.removeMark(linkStart, linkEnd, state.schema.marks.link);
                    }

                    view.dispatch(tr);
                    return true;
                  }

                  // For Delete key inside a link
                  if (event.key === 'Delete') {
                    // Find the end of the link
                    let linkEnd = selection.from;
                    while (linkEnd < doc.content.size) {
                      const markAt = doc.rangeHasMark(
                        linkEnd,
                        linkEnd + 1,
                        state.schema.marks.link
                      );
                      if (!markAt) break;
                      linkEnd++;
                    }

                    // If we're at the end of the link, let normal deletion happen
                    if (selection.from === linkEnd - 1) {
                      return false;
                    }

                    // Otherwise handle deletion within the link
                    const tr = state.tr;
                    tr.delete(selection.from, selection.from + 1);
                    view.dispatch(tr);
                    return true;
                  }

                  // We're inside a link but not at the boundaries
                  // Let normal deletion proceed
                  return false;
                }

                // Check if we're right before a link (for Delete key)
                if (event.key === 'Delete') {
                  const nodeAfter = $pos.nodeAfter;
                  if (nodeAfter && nodeAfter.marks.some((mark) => mark.type.name === 'link')) {
                    // Delete one character and check if the link would become empty
                    const tr = state.tr;
                    tr.delete(selection.from, selection.from + 1);
                    view.dispatch(tr);
                    return true;
                  }
                }

                // Check if we're right after a link (for Backspace key)
                if (event.key === 'Backspace') {
                  const nodeBefore = $pos.nodeBefore;
                  if (nodeBefore && nodeBefore.marks.some((mark) => mark.type.name === 'link')) {
                    // Find the start of the link
                    let linkStart = selection.from - 1;
                    while (linkStart > 0) {
                      const markAt = doc.rangeHasMark(
                        linkStart - 1,
                        linkStart + 1,
                        state.schema.marks.link
                      );
                      if (!markAt) break;
                      linkStart--;
                    }

                    // If the link is only one character, remove the link entirely
                    if (selection.from - linkStart === 1) {
                      const tr = state.tr;
                      tr.removeMark(linkStart, selection.from, state.schema.marks.link);
                      tr.delete(selection.from - 1, selection.from);
                      view.dispatch(tr);
                      return true;
                    }

                    // Otherwise, just delete one character at the end of the link
                    const tr = state.tr;
                    tr.delete(selection.from - 1, selection.from);
                    view.dispatch(tr);
                    return true;
                  }
                }
              }
            }

            return false;
          }
        }
      })
    ];
  }
});

// Component for the link editor popover content
interface LinkEditorPopoverContentProps {
  linkUrl: string;
  setLinkUrl: (value: string) => void;
  linkText: string;
  setLinkText: (value: string) => void;
  applyChange: () => void;
  removeLink: () => void;
  visitLink: () => void;
}

const LinkEditorPopoverContent: React.FC<LinkEditorPopoverContentProps> = ({
  linkUrl,
  setLinkUrl,
  linkText,
  setLinkText,
  applyChange,
  removeLink,
  visitLink
}) => {
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the URL input when the popover opens
    setTimeout(() => {
      if (urlInputRef.current) {
        urlInputRef.current.focus();
      }
    }, 100);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyChange();
    }
  };

  return (
    <div className="space-y-2 rounded-md p-1 pt-0">
      <div className="flex flex-col gap-1">
        <div className="">
          <Label className="text-xs">URL</Label>
          <Input
            ref={urlInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-[270px] text-sm"
            placeholder="https://example.com"
            autoFocus
          />
        </div>

        <div className="">
          <Label className="text-xs">Link title</Label>
          <Input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-[270px] text-sm"
            placeholder="Link text"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button
          sizeVariant={'sm'}
          variant={'ghost'}
          onClick={removeLink}
          type="button"
          className="text-muted-foreground"
        >
          <MonoIcon type={'Trash'} className="mr-2" />
          Remove link
        </Button>

        <div className="flex gap-2">
          <Button
            disabled={!linkUrl.trim()}
            sizeVariant={'sm'}
            typeVariant={'default'}
            onClick={applyChange}
            type="button"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
};

// Link Button Popover Component
interface LinkButtonPopoverProps {
  editor: any;
}

export const LinkButtonPopover: React.FC<LinkButtonPopoverProps> = ({ editor }) => {
  // Add custom CSS for link button styling
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .link-text-hidden {
        display: none;
      }
      .link-button {
        position: relative;
        z-index: 1;
        cursor: pointer;
      }
      .ProseMirror a {
        cursor: text; /* Changed from pointer to text for better text edit experience */
        &:hover {
         background-color: revert;
        }
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Listen for link button clicks
  useEffect(() => {
    if (!editor) return;

    let component: ReactRenderer | null = null;
    let popup: any = null;
    let currentLinkPos: { start: number; end: number } | null = null;

    // Handle clicks on link buttons
    const handleLinkButtonClick = (event: CustomEvent) => {
      const { href, text, start, end, button, view } = event.detail;

      // Store the current link position
      currentLinkPos = { start, end };

      // Clean up any existing popup
      if (popup) {
        popup[0].destroy();
        popup = null;
      }

      if (component) {
        component.destroy();
        component = null;
      }

      // Initial link values
      let linkUrl = href || '';
      let linkText = text || '';

      // Function to apply the link change
      const applyChange = () => {
        if (!currentLinkPos) return;

        try {
          // Format the URL
          const formattedUrl = linkUrl.match(/^https?:\/\//) ? linkUrl : `https://${linkUrl}`;

          // Use the editor's chain API for reliable updates
          editor
            .chain()
            .focus()
            .setTextSelection({ from: currentLinkPos.start, to: currentLinkPos.end })
            .unsetLink() // Remove existing link
            .deleteSelection() // Delete the old text
            .insertContent(linkText) // Insert new text
            .setTextSelection({
              from: currentLinkPos.start,
              to: currentLinkPos.start + linkText.length
            })
            .setLink({ href: formattedUrl }) // Apply new link
            .run();

          // Clean up
          if (popup && popup[0]) {
            popup[0].hide();
          }
          editor.commands.focus();
        } catch (error) {
          console.error('Error updating link:', error);
        }
      };

      // Function to remove the link
      const removeLink = () => {
        if (!currentLinkPos) return;

        try {
          editor
            .chain()
            .focus()
            .setTextSelection({ from: currentLinkPos.start, to: currentLinkPos.end })
            .unsetLink() // Remove the link but keep the text
            .run();

          if (popup && popup[0]) {
            popup[0].hide();
          }
          editor.commands.focus();
        } catch (error) {
          console.error('Error removing link:', error);
        }
      };

      // Function to visit the link
      const visitLink = () => {
        try {
          const formattedUrl = linkUrl.match(/^https?:\/\//) ? linkUrl : `https://${linkUrl}`;
          window.open(formattedUrl, '_blank');
        } catch (error) {
          console.error('Error opening link:', error);
        }
      };

      // Create the React component
      component = new ReactRenderer(LinkEditorPopoverContent, {
        props: {
          linkUrl,
          setLinkUrl: (value) => {
            linkUrl = value;
            component?.updateProps({
              linkUrl: value,
              linkText,
              applyChange,
              removeLink,
              visitLink
            });
          },
          linkText,
          setLinkText: (value) => {
            linkText = value;
            component?.updateProps({
              linkUrl,
              linkText: value,
              applyChange,
              removeLink,
              visitLink
            });
          },
          applyChange,
          removeLink,
          visitLink
        },
        editor
      });

      // Get button position for placement
      const rect = button.getBoundingClientRect();

      // Create the Tippy instance with improved configuration
      try {
        popup = tippy('body', {
          getReferenceClientRect: () => rect,
          appendTo: document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom',
          theme: 'mono',
          maxWidth: 'none',
          duration: 0,
          onDestroy: () => {
            if (component) {
              component.destroy();
              component = null;
            }
          },
          onHidden: (instance) => {
            // Remove dark class from tippy box
            // instance.popper.classList.remove('dark');
          },
          onShow: (instance) => {
            // Add dark class to tippy box
            instance.popper.classList.add('dark');
          }
        });

        // Confirm the Tippy instance was created properly

        // Force show the Tippy instance
        if (popup && popup[0]) {
          popup[0].show();
        } else {
          console.error('Failed to create Tippy instance');
        }
      } catch (error) {
        console.error('Error creating Tippy instance:', error);
      }

      // Set up the keyboard event handling
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (popup && popup[0]) {
            popup[0].hide();
          }
          return true;
        }
        return false;
      };

      // Attach the event handler
      document.addEventListener('keydown', handleKeyDown);

      // Clean up the event handler when the popup is destroyed
      if (popup && popup[0] && popup[0].popper && popup[0].popper._tippy) {
        popup[0].popper._tippy.props.onDestroy = () => {
          document.removeEventListener('keydown', handleKeyDown);
          if (component) {
            component.destroy();
            component = null;
          }
        };
      }
    };

    // Listen for our custom link-button-click event on the editor DOM
    editor.view.dom.addEventListener('link-button-click', handleLinkButtonClick);

    // Also handle standard links that might not have been converted to buttons
    const handleStandardLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if we clicked on a standard link that wasn't converted to a button
      if (target.tagName === 'A') {
        event.preventDefault();
        event.stopPropagation();

        try {
          // Get link details
          const href = target.getAttribute('href') || '';
          const text = target.textContent || '';

          // Find position in the document
          const pos = editor.view.posAtDOM(target, 0);
          const end = pos + text.length;

          // Create a custom event similar to our button click
          const customEvent = {
            detail: {
              href,
              text,
              start: pos,
              end,
              button: target,
              view: editor.view
            }
          };

          // Call the handler directly
          handleLinkButtonClick(customEvent as unknown as CustomEvent);
        } catch (error) {
          console.error('Error handling standard link click:', error);
        }
      }
    };

    // Add listener for standard links
    editor.view.dom.addEventListener('click', handleStandardLinkClick);

    // Setup additional editor handling for links
    const handleClick = (event: MouseEvent) => {
      // When clicking inside the editor but not on a link button,
      // we need to ensure the editor refreshes its state
      const target = event.target as HTMLElement;
      if (
        !target.closest('.link-button') &&
        !target.closest('a') &&
        editor.view.dom.contains(target)
      ) {
        // Force a refresh of the editor to update decorations
        setTimeout(() => {
          editor.commands.focus();
        }, 10);
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      // Clean up
      editor.view.dom.removeEventListener('link-button-click', handleLinkButtonClick);
      editor.view.dom.removeEventListener('click', handleStandardLinkClick);
      document.removeEventListener('click', handleClick);
    };
  }, [editor]);

  // No direct rendering needed
  return null;
};
