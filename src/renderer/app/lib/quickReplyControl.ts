/**
 * The reader's quick reply (ThreadReplyBar), for the R key: opens the reply
 * box under the open conversation and returns true, or returns false when the
 * box isn't on screen for that conversation (R then opens the compose window,
 * as before). Set by the bar while it's mounted.
 */
export const quickReplyControl: {
  open:
    | ((
        threadId: string,
        options?: {
          /** Switch it to Reply all. */
          replyAll?: boolean;
          /** Only when a reply is being written there (open, or folded with text). */
          onlyIfWriting?: boolean;
        }
      ) => boolean)
    | null;
} = {
  open: null
};
