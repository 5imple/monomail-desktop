import { useFloating, autoUpdate, offset, flip } from '@floating-ui/react-dom';
import { Editor, isNodeSelection, posToDOMRect } from '@tiptap/core';
import { ReactNode, useEffect, useLayoutEffect, useState } from 'react';

type Props = {
  editor: Editor;
  children: ReactNode;
  updateDelay?: number;
  shouldShow?: ((props: { editor: Editor; from: number; to: number }) => boolean) | null;
};

export const ControlledBubbleMenu = ({
  editor,
  children,
  updateDelay = 250,
  shouldShow
}: Props) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [timerId, setTimerId] = useState<number | null>(null);

  const { floatingStyles, refs } = useFloating({
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    placement: 'top',
    middleware: [
      offset({ mainAxis: 8 }),
      flip({
        padding: 8,
        boundary: editor.options.element,
        fallbackPlacements: ['bottom', 'top-start', 'bottom-start', 'top-end', 'bottom-end']
      })
    ]
  });

  useLayoutEffect(() => {
    const { ranges } = editor.state.selection;
    const from = Math.min(...ranges.map((range) => range.$from.pos));
    const to = Math.max(...ranges.map((range) => range.$to.pos));

    refs.setReference({
      getBoundingClientRect() {
        if (isNodeSelection(editor.state.selection)) {
          const node = editor.view.nodeDOM(from) as HTMLElement | null;

          if (node) {
            return node.getBoundingClientRect();
          }
        }

        return posToDOMRect(editor.view, from, to);
      }
    });
  }, [refs, editor.view, editor.state.selection]);

  useEffect(() => {
    const handleMouseDown = () => {
      setIsSelecting(true);
    };

    const handleMouseUp = () => {
      setIsSelecting(false);
    };

    editor.view.dom.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      editor.view.dom.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editor.view.dom]);

  useEffect(() => {
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const hasValidSelection = from !== to;

    if (timerId) {
      window.clearTimeout(timerId);
    }

    if (!hasValidSelection || isSelecting) {
      setIsVisible(false);
      return;
    }

    const defaultShouldShow = () => {
      const isEmptyTextBlock = !state.doc.textBetween(from, to).length && state.selection.empty;
      const hasEditorFocus = editor.isFocused;

      if (!hasEditorFocus || empty || isEmptyTextBlock || !editor.isEditable) {
        return false;
      }

      return true;
    };

    const shouldShowResult = shouldShow ? shouldShow({ editor, from, to }) : defaultShouldShow();

    if (!shouldShowResult) {
      setIsVisible(false);
      return;
    }

    const newTimerId = window.setTimeout(() => {
      setIsVisible(true);
    }, updateDelay);

    setTimerId(newTimerId);

    return () => {
      window.clearTimeout(newTimerId);
    };
  }, [editor.state.selection, isSelecting]);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={`controlled-bubble-menu z-[1000] fixed transition-opacity duration-150 delay-100	${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {children}
    </div>
  );
};
