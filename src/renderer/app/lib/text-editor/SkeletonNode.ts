import { Node, mergeAttributes } from '@tiptap/core';

export const SkeletonNode = Node.create({
  name: 'skeleton',
  group: 'block',
  atom: true, // Prevents direct user editing

  addAttributes() {
    return {
      id: { default: null },
      width: { default: 300 }, // Default width
      height: { default: 150 } // Default height
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="skeleton"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'skeleton',
        class: 'bg-muted-low animate-pulse rounded-md',
        style: `width: ${HTMLAttributes.width}px; height: ${HTMLAttributes.height}px;`
      })
    ];
  }
});
