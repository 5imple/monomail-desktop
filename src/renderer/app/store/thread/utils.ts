import { MonoThread } from '@/main/models/thread/MonoThread';

export const mergeAndDeduplicateThreads = (
  oldThreads: MonoThread[],
  newThreads: MonoThread[]
): MonoThread[] => {
  const threadMap = new Map<string, MonoThread>();
  [...oldThreads, ...newThreads].forEach((thread) => {
    if (
      !threadMap.has(thread.id) ||
      new Date(thread.timestamp) > new Date(threadMap.get(thread.id)!.timestamp)
    ) {
      threadMap.set(thread.id, thread);
    }
  });
  return Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};
