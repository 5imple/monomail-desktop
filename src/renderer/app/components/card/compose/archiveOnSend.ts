import { isComposeDraftId } from '@/main/utils';
import type { ThreadCommandArgs } from '@/renderer/app/lib/commands/types';

/**
 * Sending a reply finishes its conversation: it is archived (Done) and the
 * reader closes back to the inbox (E and # open the next email instead).
 *
 * Not when the conversation has a reminder set (it is meant to come back),
 * not when it isn't in the inbox anyway, and not for a new message.
 *
 * It leaves the inbox at once, but the server only archives it once the
 * reply has actually gone: until then the send can still be undone, fail,
 * or be lost with the window (a quit or reload during the countdown), and
 * none of those may leave an unsent reply in an archived conversation.
 */
export interface ArchiveOnSend {
  /** The message left (the provider accepted it): archive on the server. */
  onSent: () => void;
  /** Undo, cancel, or a failure before the message left: back in the inbox. */
  restore: () => void;
}

const NOOP: ArchiveOnSend = { onSent: () => undefined, restore: () => undefined };

export function startArchiveOnSend(options: {
  threadId: string | undefined;
  /** The conversation as the list has it, if it's loaded. */
  thread: { labelIds?: string[] } | undefined;
  /** Reminders in the local cache (instant, may be stale). */
  hasCachedReminder: (threadId: string) => boolean;
  /**
   * Asks the scheduler, which knows every account's reminders: true / false,
   * or null when it can't say (then the cache's answer stands).
   */
  checkReminder: (threadId: string) => Promise<boolean | null>;
  runDone: (args: ThreadCommandArgs) => unknown;
}): ArchiveOnSend {
  const { threadId, thread } = options;
  if (
    !threadId ||
    !thread ||
    isComposeDraftId(threadId) ||
    !thread.labelIds?.includes('INBOX') ||
    options.hasCachedReminder(threadId)
  ) {
    return NOOP;
  }

  let state: 'pending' | 'sent' | 'restored' = 'pending';
  let undoLocal: (() => void) | null = null;
  let settle: { resolve: () => void; reject: (reason: Error) => void } | null = null;

  // Started now so the answer is in by the time the countdown ends.
  const reminder = options.checkReminder(threadId).catch(() => null);
  const sent = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });

  const restoreLocally = () => {
    undoLocal?.();
    undoLocal = null;
  };

  // What the server archive waits for: the reply has gone, and the scheduler
  // doesn't know of a reminder the cache missed.
  const serverGate = sent.then(async () => {
    if ((await reminder) === true) {
      restoreLocally();
      throw new Error('The conversation has a reminder set');
    }
  });
  serverGate.catch(() => undefined);

  options.runDone({
    threadIds: [threadId],
    returnToList: true,
    waitFor: serverGate,
    onQuietUndo: (undo) => {
      undoLocal = undo;
    }
  });

  return {
    onSent: () => {
      if (state !== 'pending') return;
      state = 'sent';
      settle?.resolve();
    },
    restore: () => {
      if (state !== 'pending') return;
      state = 'restored';
      settle?.reject(new Error('The send did not go out'));
      restoreLocally();
    }
  };
}
