import { Mark, mergeAttributes } from '@tiptap/core';

export const ProofreadMarks = Mark.create({
  name: 'proofreadMarks',

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.proofread-mark'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, this.options.HTMLAttributes, {
        class:
          'proofread-mark underline-red selection:decoration-red-300 pointer-events-auto cursor-pointer',
        onclick: (event) => {
          // Access the span's inner text and print it when clicked
        }
      }),
      0
    ];
  },

  addAttributes() {
    return {
      cssClasses: {
        default: '',
        parseHTML: (element) => element.getAttribute('class') || '',
        renderHTML: (attributes) => {
          return {
            class: attributes.cssClasses
          };
        }
      },
      underline: {
        default: 'underline-red',
        parseHTML: (element) => element.classList.contains('underline-red'),
        renderHTML: (attributes) => {
          return {
            class: `underline-red underline decoration-pink-500 ${attributes.cssClasses}`
          };
        }
      }
    };
  }
});
