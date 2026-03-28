import Image from '@tiptap/extension-image';

export const ImageResize = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: 'width: 100%; height: auto; cursor: pointer;',
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          return width
            ? `width: ${width}px; height: auto; cursor: pointer;`
            : `${element.style.cssText}`;
        }
      }
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const {
        view,
        options: { editable }
      } = editor;
      const { style } = node.attrs;
      const $wrapper = document.createElement('div');
      const $container = document.createElement('div');
      const $img = document.createElement('img');
      const iconStyle = 'width: 24px; height: 24px; cursor: pointer;';

      const dispatchNodeView = () => {
        if (typeof getPos === 'function') {
          const newAttrs = {
            ...node.attrs,
            style: `${$img.style.cssText}`
          };
          view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, newAttrs));
        }
      };

      $wrapper.setAttribute('style', `display: flex;`);
      $wrapper.appendChild($container);

      $container.setAttribute('style', `${style}`);
      $container.appendChild($img);

      Object.entries(node.attrs).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        $img.setAttribute(key, value);
      });

      if (!editable) return { dom: $container };
      const isMobile = document.documentElement.clientWidth < 768;
      const dotPosition = isMobile ? '-8px' : '-5px';
      const dotsPosition = [
        `top: ${dotPosition}; left: ${dotPosition}; cursor: nwse-resize;`,
        `top: ${dotPosition}; right: ${dotPosition}; cursor: nesw-resize;`,
        `bottom: ${dotPosition}; left: ${dotPosition}; cursor: nesw-resize;`,
        `bottom: ${dotPosition}; right: ${dotPosition}; cursor: nwse-resize;`
      ];

      let isResizing = false;
      let startX: number, startWidth: number;

      $container.addEventListener('click', (e) => {
        //remove remaining dots and position controller
        const isMobile = document.documentElement.clientWidth < 768;
        isMobile && (document.querySelector('.ProseMirror-focused') as HTMLElement)?.blur();

        if ($container.childElementCount > 3) {
          for (let i = 0; i < 5; i++) {
            $container.removeChild($container.lastChild as Node);
          }
        }

        $container.setAttribute(
          'style',
          `position: relative; border: 2px solid hsl(var(--accent)); ${style} cursor: pointer;`
        );

        Array.from({ length: 4 }, (_, index) => {
          const $dot = document.createElement('div');
          $dot.setAttribute(
            'style',
            `position: absolute; width: ${isMobile ? 16 : 9}px; height: ${isMobile ? 16 : 9}px; border-radius: 50%; ${dotsPosition[index]} background-color: hsl(var(--accent))`
          );

          $dot.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startWidth = $container.offsetWidth;

            const onMouseMove = (e: MouseEvent) => {
              if (!isResizing) return;
              const deltaX = index % 2 === 0 ? -(e.clientX - startX) : e.clientX - startX;

              const newWidth = startWidth + deltaX;

              $container.style.width = newWidth + 'px';

              $img.style.width = newWidth + 'px';
            };

            const onMouseUp = () => {
              if (isResizing) {
                isResizing = false;
              }
              dispatchNodeView();

              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });

          $dot.addEventListener(
            'touchstart',
            (e) => {
              e.cancelable && e.preventDefault();
              isResizing = true;
              startX = e.touches[0].clientX;
              startWidth = $container.offsetWidth;

              const onTouchMove = (e: TouchEvent) => {
                if (!isResizing) return;
                const deltaX =
                  index % 2 === 0
                    ? -(e.touches[0].clientX - startX)
                    : e.touches[0].clientX - startX;

                const newWidth = startWidth + deltaX;

                $container.style.width = newWidth + 'px';

                $img.style.width = newWidth + 'px';
              };

              const onTouchEnd = () => {
                if (isResizing) {
                  isResizing = false;
                }
                dispatchNodeView();

                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
              };

              document.addEventListener('touchmove', onTouchMove);
              document.addEventListener('touchend', onTouchEnd);
            },
            { passive: false }
          );
          $container.appendChild($dot);
        });
      });

      document.addEventListener('click', (e: MouseEvent) => {
        const $target = e.target as HTMLElement;
        const isClickInside = $container.contains($target) || $target.style.cssText === iconStyle;

        if (!isClickInside) {
          const containerStyle = $container.getAttribute('style');
          const newStyle = containerStyle?.replace('border: 2px solid hsl(var(--accent));', '');
          $container.setAttribute('style', newStyle as string);

          if ($container.childElementCount > 3) {
            for (let i = 0; i < 5; i++) {
              $container.removeChild($container.lastChild as Node);
            }
          }
        }
      });

      return {
        dom: $wrapper
      };
    };
  }
});
