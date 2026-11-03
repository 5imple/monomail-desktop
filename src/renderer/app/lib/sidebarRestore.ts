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

/** The defaults version that added Done and Trash to the sidebar. */
export const SIDEBAR_DEFAULTS_VERSION = 2;

/**
 * Gives a sidebar saved before Done and Trash were default rows those rows,
 * once: after Done (E) or Delete there was no visible place the email went.
 * Rows already present (anywhere, also inside a folder) are left alone, and
 * the version is recorded so a row the user then removes stays removed.
 * Returns the same object when there is nothing to do.
 */
export function withSidebarDefaults(
  sidebar: CustomSidebarState,
  newDefaults: CustomNavItem[]
): CustomSidebarState {
  if ((sidebar.defaultsVersion ?? 1) >= SIDEBAR_DEFAULTS_VERSION) return sidebar;
  const items = { ...sidebar.items };
  const order = [...sidebar.order];
  for (const item of newDefaults) {
    if (items[item.id]) continue;
    items[item.id] = { ...item, position: order.length };
    order.push(item.id);
  }
  return { ...sidebar, items, order, defaultsVersion: SIDEBAR_DEFAULTS_VERSION };
}
