import { Extension } from '@tiptap/core';
import { Fragment, Node as PMNode } from '@tiptap/pm/model';
import { EditorView } from '@tiptap/pm/view';

/**
 * Replace the selection with plain text, keeping its line breaks. Inserting a
 * single text node kept raw "\n" characters, which the editor displayed
 * (pre-wrap) but recipients received as one run-on paragraph.
 */
export function insertPlainText(view: EditorView, text: string) {
  const { state } = view;
  const { schema } = state;
  const hardBreak = schema.nodes.hardBreak;
  const nodes: PMNode[] = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index > 0 && hardBreak) nodes.push(hardBreak.create());
    if (line) nodes.push(schema.text(line));
  });
  if (nodes.length === 0) return;
  const { from, to } = state.selection;
  view.dispatch(state.tr.replaceWith(from, to, Fragment.from(nodes)).scrollIntoView());
}

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
                insertPlainText(editor.view, text);
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
