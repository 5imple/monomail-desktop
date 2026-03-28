import { Node, mergeAttributes } from '@tiptap/core';

export const HistoryNode = Node.create({
  name: 'history',

  group: 'block',
  content: 'text*',
  inline: false,

  addAttributes() {
    return {
      content: {
        default: '',
        parseHTML: (element) => element.innerHTML,
        renderHTML: (attributes) => ({
          'data-content': attributes.content
        })
      },
      visible: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-visible') === 'true',
        renderHTML: (attributes) => ({
          'data-visible': attributes.visible
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-history]'
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const content = HTMLAttributes['data-content'];
    const visible = HTMLAttributes['data-visible'];
    const div = document.createElement('div');

    div.dataset.type = 'text*';
    div.setAttribute('contenteditable', 'true');
    div.innerHTML = content;
    return div;
  }

  // addCommands() {
  //   return {
  //     toggleHistoryVisibility:
  //       (visible: boolean) =>
  //       ({ tr, state, dispatch }) => {
  //         const { selection } = state;
  //         const { from, to } = selection;

  //         state.doc.nodesBetween(from, to, (node, pos) => {
  //           if (node.type.name === 'history') {
  //             const updatedAttrs = { ...node.attrs, visible };
  //             tr.setNodeMarkup(pos, undefined, updatedAttrs);
  //           }
  //         });

  //         if (dispatch) {
  //           dispatch(tr);
  //         }
  //         return true;
  //       }
  //   };
  // }
});
