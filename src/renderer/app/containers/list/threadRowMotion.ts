import type { Variants } from 'motion/react';
import type { ThreadExitIntent } from '@/renderer/app/store/thread/exitIntentAtom';

/**
 * Exit motion for thread-list rows, keyed on why the row left
 * (threadExitIntentAtom, delivered through AnimatePresence `custom`):
 *
 *  - archive (Done): the row swipes RIGHT over a green lane with a check
 *  - trash / spam:   the row swipes LEFT over a red lane with a trash can
 *  - anything else (filter, sync, view change): a quick fade + collapse
 *
 * In every case the row's height then collapses, so the rows below glide up
 * instead of snapping into the gap. Reduced motion skips the swipe.
 */

type Intents = Record<string, ThreadExitIntent> | undefined;

// iOS-like "swipe away" curve: fast start, long soft settle.
const SWIPE_EASE = [0.32, 0.72, 0, 1] as const;
const SWIPE_DURATION = 0.26;
// The gap starts closing just before the swipe finishes.
const COLLAPSE_DELAY = 0.2;
const COLLAPSE_DURATION = 0.2;

/** Outer row wrapper: holds its height through the swipe, then collapses. */
export const rowVariants = (threadId: string, reduceMotion: boolean): Variants => ({
  present: { height: 'auto', opacity: 1 },
  exit: (intents: Intents) =>
    intents?.[threadId] && !reduceMotion
      ? {
          height: 0,
          // Fade the revealed lane while the gap closes, so its label doesn't
          // get squashed.
          opacity: 0,
          transition: {
            height: { delay: COLLAPSE_DELAY, duration: COLLAPSE_DURATION, ease: SWIPE_EASE },
            opacity: { delay: COLLAPSE_DELAY, duration: COLLAPSE_DURATION * 0.8, ease: 'easeOut' }
          }
        }
      : { height: 0, opacity: 0, transition: { duration: 0.16, ease: 'easeOut' } }
});

/** The row itself: slides off in the direction of the action. */
export const swipeVariants = (threadId: string, reduceMotion: boolean): Variants => ({
  present: { x: 0 },
  exit: (intents: Intents) => {
    const intent = intents?.[threadId];
    if (!intent || reduceMotion) return {};
    return {
      x: intent === 'archive' ? '100%' : '-100%',
      transition: { duration: SWIPE_DURATION, ease: SWIPE_EASE }
    };
  }
});

/** Colored lane revealed behind the sliding row; only the matching one shows. */
export const laneVariants = (
  threadId: string,
  lane: ThreadExitIntent,
  reduceMotion: boolean
): Variants => ({
  present: { opacity: 0 },
  exit: (intents: Intents) => ({
    opacity: !reduceMotion && intents?.[threadId] === lane ? 1 : 0,
    transition: { duration: 0.08 }
  })
});

/**
 * Date-group header ("Today", …). It sits in the same animated list as the
 * rows, so when its last row leaves it collapses right after the swipe instead
 * of the whole group vanishing at once.
 */
export const groupHeaderVariants: Variants = {
  present: { height: 'auto', opacity: 1 },
  exit: {
    height: 0,
    opacity: 0,
    transition: { delay: COLLAPSE_DELAY, duration: COLLAPSE_DURATION, ease: SWIPE_EASE }
  }
};

/**
 * Reader content when the open email is archived / trashed and the reader
 * moves on: the outgoing email swipes the same way its row does (partially —
 * the reader is wide) while fading, then the next one fades in. Ordinary
 * thread switches just cross-fade quickly.
 */
export const readerSwipeVariants = (threadId: string, reduceMotion: boolean): Variants => ({
  enter: { opacity: 0 },
  present: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: (intents: Intents) => {
    const intent = intents?.[threadId];
    if (!intent || reduceMotion) return { opacity: 0, transition: { duration: 0.08 } };
    return {
      x: intent === 'archive' ? '35%' : '-35%',
      opacity: 0,
      transition: { duration: 0.22, ease: SWIPE_EASE }
    };
  }
});
