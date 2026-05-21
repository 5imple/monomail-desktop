import { cn } from '@/renderer/app/lib/utils';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';

interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  action: () => void;
}

interface SwipeableListItemProps {
  children: React.ReactNode;
  onShortSwipeLeft?: SwipeAction;
  onLongSwipeLeft?: SwipeAction;
  onShortSwipeRight?: SwipeAction;
  onLongSwipeRight?: SwipeAction;
  onRemove?: () => void;
}

export interface SwipeableListItemRef {
  scrollToAction: (direction: 'left' | 'right', type: 'short' | 'long') => void;
}

const SwipeableListItem = forwardRef<SwipeableListItemRef, SwipeableListItemProps>(
  (
    {
      children,
      onShortSwipeLeft,
      onLongSwipeLeft,
      onShortSwipeRight,
      onLongSwipeRight,
      onRemove,
      ...rest
    },
    ref
  ) => {
    const [swipeDistance, setSwipeDistance] = useState(0);
    const [removing, setRemoving] = useState(false);
    const [bgColorClass, setBgColorClass] = useState('bg-muted-low');
    const swipeDistanceRef = useRef(0);
    const startX = useRef<number | null>(null);
    const startY = useRef<number | null>(null);
    const isSwiping = useRef(false);
    const initialThreshold = 10;
    const thresholdShort = 50;
    const thresholdLong = 250;
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToAction: (direction: 'left' | 'right', type: 'short' | 'long') => {
        const targetDistance = type === 'long' ? thresholdLong + 1 : thresholdShort + 1;
        const distance = direction === 'left' ? -targetDistance : targetDistance;
        smoothSwipeTo(distance, () => {
          handleSwipeAction();
          setSwipeDistance(0);
        });
      }
    }));

    const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const smoothSwipeTo = (targetDistance: number, callback: () => void) => {
      const duration = 300; // duration of the animation in ms
      const start = swipeDistanceRef.current;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        const easedProgress = easeInOutQuad(progress);
        const newDistance = start + (targetDistance - start) * easedProgress;

        swipeDistanceRef.current = newDistance;
        setSwipeDistance(newDistance);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          callback();
        }
      };

      requestAnimationFrame(animate);
    };

    const smoothTranslation = (targetDistance: number, callback: () => void) => {
      const duration = 300; // duration of the animation in ms
      const start = swipeDistanceRef.current;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        const easedProgress = easeInOutQuad(progress);
        const newDistance = start + (targetDistance - start) * easedProgress;
        swipeDistanceRef.current = newDistance;
        setSwipeDistance(newDistance);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          callback();
        }
      };

      requestAnimationFrame(animate);
    };

    const smoothHeightReduction = (element: HTMLElement, callback: () => void) => {
      const duration = 300; // duration of the animation in ms
      const startHeight = element.clientHeight;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        const easedProgress = easeInOutQuad(progress);
        const newHeight = startHeight * (1 - easedProgress);

        element.style.height = `${newHeight}px`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          callback();
        }
      };

      requestAnimationFrame(animate);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isSwiping.current = false;
      swipeDistanceRef.current = 0;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (startX.current !== null && startY.current !== null) {
        const deltaX = e.touches[0].clientX - startX.current;
        const deltaY = e.touches[0].clientY - startY.current;
        handleMove(deltaX, deltaY);
      }
    };

    const handleTouchEnd = () => {
      handleEnd();
    };

    const handleMouseStart = (e: React.MouseEvent) => {
      startX.current = e.clientX;
      startY.current = e.clientY;
      isSwiping.current = false;
      swipeDistanceRef.current = 0;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseEnd);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (startX.current !== null && startY.current !== null) {
        const deltaX = e.clientX - startX.current;
        const deltaY = e.clientY - startY.current;
        handleMove(deltaX, deltaY);
      }
    };

    const handleMouseEnd = () => {
      handleEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseEnd);
    };

    const handleMove = (deltaX: number, deltaY: number) => {
      if (
        !isSwiping.current &&
        Math.abs(deltaX) > initialThreshold &&
        Math.abs(deltaY) < initialThreshold
      ) {
        isSwiping.current = true;
      }
      if (isSwiping.current) {
        swipeDistanceRef.current = deltaX;
        setSwipeDistance(deltaX);
        setBgColorClass(getBackgroundColorClass(deltaX));
      }
    };

    const handleEnd = () => {
      if (isSwiping.current) {
        handleSwipeAction();
        isSwiping.current = false;
      }
      startX.current = null;
      startY.current = null;
      // swipeDistanceRef.current = 0;
    };

    const handleSwipeAction = () => {
      if (swipeDistanceRef.current > thresholdLong) {
        if (onLongSwipeRight) {
          onLongSwipeRight.action();
          setBgColorClass('bg-green-500');
          initiateRemove('right');
        } else if (onShortSwipeRight) {
          onShortSwipeRight.action();
          setBgColorClass('bg-stone-400');
          setSwipeDistance(0);
        }
      } else if (swipeDistanceRef.current > thresholdShort && onShortSwipeRight) {
        onShortSwipeRight.action();
        setBgColorClass('bg-stone-400');
        setSwipeDistance(0);
      } else if (swipeDistanceRef.current < -thresholdLong) {
        if (onLongSwipeLeft) {
          onLongSwipeLeft.action();
          setBgColorClass('bg-red-500');
          initiateRemove('left');
        } else if (onShortSwipeLeft) {
          onShortSwipeLeft.action();
          setBgColorClass('bg-orange-500');
          setSwipeDistance(0);
        }
      } else if (swipeDistanceRef.current < -thresholdShort && onShortSwipeLeft) {
        onShortSwipeLeft.action();
        setBgColorClass('bg-orange-500');
        setSwipeDistance(0);
      } else {
        smoothTranslation(0, () => {});
      }
      // swipeDistanceRef.current = 0;
    };

    const initiateRemove = (direction: 'left' | 'right') => {
      if (scrollContainerRef.current) {
        const targetDistance =
          direction === 'left'
            ? -scrollContainerRef.current.clientWidth
            : scrollContainerRef.current.clientWidth;
        smoothTranslation(targetDistance, () => {
          if (scrollContainerRef.current) {
            smoothHeightReduction(scrollContainerRef.current, () => {
              onRemove?.();
            });
          }
        });
      }
    };

    const getBackgroundColorClass = (distance: number) => {
      if (distance > thresholdLong && onLongSwipeRight) return 'bg-green-500';
      if (distance > thresholdShort && onShortSwipeRight) return 'bg-stone-400';
      if (distance < -thresholdLong && onLongSwipeLeft) return 'bg-red-500';
      if (distance < -thresholdShort && onShortSwipeLeft) return 'bg-orange-500';
      if (swipeDistanceRef.current < 0) {
        if (onShortSwipeLeft) return 'bg-orange-500 duration-0';
        if (onLongSwipeLeft) return 'bg-red-500 duration-0';
      } else if (swipeDistanceRef.current > 0) {
        if (onShortSwipeRight) return 'bg-stone-400 duration-0';
        if (onLongSwipeRight) return 'bg-green-500 duration-0';
      }
      return 'bg-muted-low duration-0';
    };

    const renderSwipeAction = (
      shortAction: SwipeAction | undefined,
      longAction: SwipeAction | undefined,
      distance: number
    ) => {
      if (longAction && Math.abs(distance) > thresholdLong) {
        return (
          <div
            className={cn(
              'flex items-center justify-center transition-opacity duration-150',
              Math.abs(distance) > thresholdLong ? 'opacity-100' : 'opacity-0'
            )}
          >
            {longAction.icon}
            {/* <span className="text-sm ml-1">{longAction.label}</span> */}
          </div>
        );
      } else if (shortAction) {
        return (
          <div
            className={cn(
              'flex items-center justify-center transition-opacity duration-150',
              Math.abs(distance) > thresholdShort ? 'opacity-100' : 'opacity-0'
            )}
          >
            {shortAction.icon}
            {/* <span className="text-sm ml-1">{shortAction.label}</span> */}
          </div>
        );
      }
      return null;
    };

    const shouldTranslate = (distance: number) => {
      if (distance > 0) {
        return !!onShortSwipeRight || !!onLongSwipeRight;
      }
      if (distance < 0) {
        return !!onShortSwipeLeft || !!onLongSwipeLeft;
      }
      return false;
    };

    return (
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseStart}
        ref={scrollContainerRef}
        className={cn('relative overflow-hidden select-none touch-none')}
        style={{
          height: removing ? 0 : 'auto',
          transition: removing ? 'height 300ms ease-in-out' : undefined
        }}
        {...rest}
      >
        <div
          className={cn(
            'absolute top-0 left-0 bottom-0',
            'bg-stone-400 border-b flex items-center justify-center transition-colors duration-300 text-background',
            bgColorClass
          )}
          style={{
            width: swipeDistanceRef.current > 0 ? swipeDistanceRef.current : 0,
            transition: swipeDistance === 0 ? 'width 300ms ease-in-out' : ''
          }}
        >
          {renderSwipeAction(onShortSwipeRight, onLongSwipeRight, swipeDistance)}
        </div>
        <div
          className={cn(
            'absolute top-0 right-0 bottom-0',
            'bg-orange-500 border-b flex items-center justify-center transition-colors duration-300 text-background',
            bgColorClass
          )}
          style={{
            width: swipeDistanceRef.current < 0 ? -swipeDistanceRef.current : 0,
            transition: swipeDistance === 0 ? 'width 300ms ease-in-out' : ''
          }}
        >
          {renderSwipeAction(onShortSwipeLeft, onLongSwipeLeft, swipeDistance)}
        </div>
        <div
          className="relative z-0"
          style={{
            transform: shouldTranslate(swipeDistance) ? `translateX(${swipeDistance}px)` : 'none',
            transition: swipeDistance === 0 ? 'transform 0.3s ease-in-out' : 'none'
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);

SwipeableListItem.displayName = 'SwipeableListItem';

export default SwipeableListItem;
