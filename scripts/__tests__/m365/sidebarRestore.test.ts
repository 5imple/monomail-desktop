import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CustomNavItem, CustomSidebarState } from '@/main/api/space/types';
import { restoreSidebarSubtree } from '@/renderer/app/lib/sidebarRestore';

const item = (id: string, extra: Partial<CustomNavItem> = {}): CustomNavItem =>
  ({ id, type: 'primary', title: id, position: 0, ...extra }) as CustomNavItem;

const without = (state: CustomSidebarState, ids: string[]): CustomSidebarState => {
  const items = { ...state.items };
  ids.forEach((id) => delete items[id]);
  Object.values(items).forEach((it) => {
    if (it.children)
      items[it.id] = { ...it, children: it.children.filter((c) => !ids.includes(c)) };
  });
  return { items, order: state.order.filter((id) => !ids.includes(id)) };
};

const before: CustomSidebarState = {
  items: {
    inbox: item('inbox'),
    sent: item('sent'),
    work: item('work', { type: 'folder', children: ['label-a', 'sub'] }),
    'label-a': item('label-a', { type: 'account-label', parentId: 'work' }),
    sub: item('sub', { type: 'folder', parentId: 'work', children: ['label-b'] }),
    'label-b': item('label-b', { type: 'account-label', parentId: 'sub' }),
    draft: item('draft')
  },
  order: ['inbox', 'sent', 'work', 'draft']
};

test('a removed root row comes back at its old position', () => {
  const after = without(before, ['sent']);
  const restored = restoreSidebarSubtree(before, after, 'sent');
  assert.deepEqual(restored.order, ['inbox', 'sent', 'work', 'draft']);
  assert.ok(restored.items.sent);
});

test('a removed folder comes back with everything inside it', () => {
  const after = without(before, ['work', 'label-a', 'sub', 'label-b']);
  const restored = restoreSidebarSubtree(before, after, 'work');
  assert.deepEqual(restored.order, ['inbox', 'sent', 'work', 'draft']);
  assert.deepEqual(restored.items.work.children, ['label-a', 'sub']);
  assert.deepEqual(restored.items.sub.children, ['label-b']);
});

test('a removed child returns to its folder slot, keeping edits made since', () => {
  const after = without(before, ['label-a']);
  // Since the removal the user renamed the folder and moved Draft up.
  after.items.work = { ...after.items.work, title: 'Projects' };
  after.order = ['inbox', 'draft', 'sent', 'work'];
  const restored = restoreSidebarSubtree(before, after, 'label-a');
  assert.deepEqual(restored.items.work.children, ['label-a', 'sub']);
  assert.equal(restored.items.work.title, 'Projects');
  assert.deepEqual(restored.order, ['inbox', 'draft', 'sent', 'work']);
});

test('a child whose folder is gone comes back at the root', () => {
  const after = without(before, ['work', 'label-a', 'sub', 'label-b']);
  const restored = restoreSidebarSubtree(before, after, 'label-a');
  assert.equal(restored.items['label-a'].parentId, undefined);
  assert.ok(restored.order.includes('label-a'));
});
