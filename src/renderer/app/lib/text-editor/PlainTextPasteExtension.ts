import { Extension } from '@tiptap/core';

/**
 * PlainTextPasteExtension
 *
 * This extension adds support for Cmd+Shift+V (or Ctrl+Shift+V on Windows/Linux)
 * to paste only plain text, stripping all HTML formatting.
 *
 * When users press Cmd+Shift+V, it will:
 * 1. Read plain text from the clipboard using the Clipboard API
 * 2. Insert it as plain text content, ignoring any HTML formatting
 *
 * This is useful when copying content from web pages or rich text editors
 * where you only want the text content without formatting.
 */
export const PlainTextPasteExtension = Extension.create({
  name: 'plainTextPaste',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-v': () => {
        // Handle Cmd+Shift+V (or Ctrl+Shift+V on Windows/Linux)
        const { editor } = this;

        // Check if clipboard API is available
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text) {
                // Insert plain text at current selection without any formatting
                const { state, view } = editor;
                const { from, to } = state.selection;

                // Create a transaction that replaces the selection with plain text
                const tr = state.tr.replaceWith(from, to, state.schema.text(text));
                view.dispatch(tr);
              }
            })
            .catch((error) => {
              console.error('Failed to read clipboard text:', error);
              // For now, just log the error - the user can use regular paste as fallback
            });
        } else {
          console.warn('Clipboard API not available - plain text paste not supported');
        }

        return true;
      }
    };
  }
});
