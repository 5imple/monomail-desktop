import { Mark, mergeAttributes } from '@tiptap/core';

export const SuggestionMarks = Mark.create({
  name: 'suggestionMarks',

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, this.options.HTMLAttributes), 0];
  },

  addAttributes() {
    return {
      color: {
        default: 'rgb(156, 163, 175)', // Default color
        parseHTML: (element) => element.style.color,
        renderHTML: (attributes) => {
          return {
            style: `color: ${attributes.color}`
            // contenteditable: false
          };
        }
      },
      pointerEvents: {
        default: 'none', // Default pointer-events
        parseHTML: (element) => element.style.pointerEvents,
        renderHTML: (attributes) => {
          return {
            style: `pointer-events: ${attributes.pointerEvents}`
          };
        }
      },
      cssClasses: {
        default: '',
        parseHTML: (element) => element.getAttribute('class') || '', // Parse classes from HTML
        renderHTML: (attributes) => {
          return {
            class: attributes.cssClasses // Apply the classes when rendering
          };
        }
      }
    };
  }
});
