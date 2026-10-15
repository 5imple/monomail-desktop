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
 * How the reader's content changes hands (delivered through `custom`, so the
 * outgoing email gets it too).
 */
export interface ReaderTransition {
  /** The outgoing email was archived / trashed, and the reader moved on. */
  advance: boolean;
  /** Where the incoming email sits in the list: 1 below the outgoing one, -1 above. */
  direction: 1 | -1;
}

// Starts at once, under the click, and speeds up as the email goes.
const PUT_AWAY_EASE = [0.4, 0, 1, 1] as const;

// One `transform` string rather than y / scale: Motion runs transform (like
// opacity) on the compositor, so the hand-over stays smooth while the next
// email renders. Never animated to or from `none` (Motion zeroes it, i.e.
// scale(0)): it starts from an explicit offset and is cleared to `none` once
// settled, so the reader keeps no transform (which would re-anchor
// fixed-position content inside it).
const offset = (y: number, scale = 1) => `translateY(${y}px) scale(${scale})`;

/**
 * Reader content when the open email is archived / trashed and the reader
 * moves on. No sideways swipe here: that's the inbox rows' motion, and across
 * the full-width reader it read as paging sideways. The email is put away
 * instead (it settles back a little and fades), then the next one rises into
 * its place, as the rows below glide up to close the gap in the inbox. It
 * comes down from above when the reader stepped up the list (the email was
 * the last one). Ordinary thread switches just cross-fade quickly.
 */
export const readerVariants = (reduceMotion: boolean): Variants => ({
  enter: ({ advance, direction }: ReaderTransition) =>
    advance && !reduceMotion ? { opacity: 0, transform: offset(direction * 18) } : { opacity: 0 },
  present: ({ advance }: ReaderTransition) =>
    advance && !reduceMotion
      ? {
          opacity: 1,
          transform: offset(0),
          transitionEnd: { transform: 'none' },
          transition: {
            transform: { duration: 0.28, ease: SWIPE_EASE },
            opacity: { duration: 0.18, ease: 'easeOut' }
          }
        }
      : { opacity: 1, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: ({ advance, direction }: ReaderTransition) =>
    advance && !reduceMotion
      ? {
          opacity: 0,
          transform: [offset(0), offset(direction * -8, 0.97)],
          transition: { duration: 0.14, ease: PUT_AWAY_EASE }
        }
      : { opacity: 0, transition: { duration: 0.08 } }
});
