/**
 * What a request for the next page did: 'started' (done resolves when it
 * lands), 'busy' (a load is already running; ask again shortly) or 'none'
 * (nothing more can be loaded for this view).
 */
export interface LoadMoreResult {
  state: 'started' | 'busy' | 'none';
  done: Promise<void>;
}

/**
 * The list's actions for code outside its provider (the reader sits beside
 * ThreadListProvider, not inside it). Set by ThreadListProvider.
 */
export const threadListActions: {
  loadMore: () => LoadMoreResult;
  /** The quiet refresh after a send / move / delete (ThreadListProvider). */
  refreshNow: () => void;
  /**
   * While above 0, the refresh after each change waits (the offline queue
   * replaying: a refresh between two replayed archives would list the second
   * one still in the Inbox). The holder calls refreshNow when done.
   */
  autoRefreshHolds: number;
} = {
  loadMore: () => ({ state: 'none', done: Promise.resolve() }),
  refreshNow: () => {},
  autoRefreshHolds: 0
};
