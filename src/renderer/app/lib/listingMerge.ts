/**
 * A quiet refresh lists one folder (Inbox page 1), and a Microsoft listing
 * builds each conversation from that folder's messages only. The copy already
 * loaded may hold the whole conversation (your replies in Sent, archived
 * earlier messages), so the listing must never replace it: it only brings in
 * messages not seen yet. Nothing new: null (keep the loaded copy as it is).
 */
interface ListingItem {
  id: string;
  timestamp?: number;
}

interface ListingThread {
  items: ListingItem[];
  labelIds: string[];
  timestamp: number;
  snippet: string | null;
}

export function mergeListing<T extends ListingThread>(
  existing: T | undefined,
  listing: T
): T | null {
  if (!existing) return listing;
  const known = new Set(existing.items.map((item) => item.id));
  const fresh = listing.items.filter((item) => !known.has(item.id));
  if (fresh.length === 0) return null;
  const items = [...existing.items, ...fresh].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)
  ) as T['items'];
  const listingIsNewer = listing.timestamp >= existing.timestamp;
  return {
    ...existing,
    items,
    // A new message brings its labels (UNREAD, INBOX); none are taken away.
    labelIds: [...new Set([...existing.labelIds, ...listing.labelIds])],
    timestamp: Math.max(existing.timestamp, listing.timestamp),
    snippet: listingIsNewer ? listing.snippet : existing.snippet
  };
}
