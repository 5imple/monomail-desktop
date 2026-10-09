import type { CustomNavItem, CustomSidebarState } from '@/main/api/space/types';

/**
 * Undo for removing a sidebar row: puts the item back — with everything that
 * was inside it, for a folder — into the *current* sidebar, so edits made
 * since the removal survive. It returns to its old parent folder at its old
 * position when that folder still exists, otherwise to the root list at its
 * old position.
 */
export function restoreSidebarSubtree(
  before: CustomSidebarState,
  current: CustomSidebarState,
  itemId: string
): CustomSidebarState {
  const removed = before.items[itemId];
  if (!removed) return current;

  const subtree: Record<string, CustomNavItem> = {};
  const collect = (id: string) => {
    const item = before.items[id];
    if (!item || subtree[id]) return;
    subtree[id] = item;
    if (item.type === 'folder') item.children?.forEach(collect);
  };
  collect(itemId);

  const items: Record<string, CustomNavItem> = { ...current.items, ...subtree };
  let order = current.order.filter((id) => !(id in subtree));

  const insertAt = (list: string[], index: number) => {
    const next = [...list];
    next.splice(index >= 0 ? Math.min(index, next.length) : next.length, 0, itemId);
    return next;
  };

  const parentId = removed.parentId;
  const parent = parentId ? items[parentId] : undefined;
  if (parentId && parent?.type === 'folder') {
    const children = (parent.children ?? []).filter((id) => id !== itemId);
    const oldIndex = before.items[parentId]?.children?.indexOf(itemId) ?? -1;
    items[parentId] = { ...parent, children: insertAt(children, oldIndex) };
  } else {
    if (parentId) items[itemId] = { ...removed, parentId: undefined };
    order = insertAt(order, before.order.indexOf(itemId));
  }

  return { items, order };
}
