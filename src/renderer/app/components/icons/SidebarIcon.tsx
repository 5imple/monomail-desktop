import { memo } from 'react';
import InboxIcon, { type InboxIconProps } from '@/renderer/app/components/icons/InboxIcon';

export type { MonoIconType, InboxIconType } from '@/renderer/app/components/icons/InboxIcon';

/**
 * Left-menu (sidebar) icon. Renders through the same Material Symbols system as
 * the banner (InboxIcon) but defaults to a heavier weight (300) so the sidebar
 * matches the banner's icon weight.
 *
 * This is a thin wrapper: only the default weight changes — every prop passes
 * through and any call site may still override `weight` (or size, fill,
 * className, etc.). Sidebar files import it as `MonoIcon`, so any icon added to
 * the left menu picks up the weight automatically.
 */
const SidebarIcon = memo(({ weight = 300, ...props }: InboxIconProps) => (
  <InboxIcon weight={weight} {...props} />
));

SidebarIcon.displayName = 'SidebarIcon';

export default SidebarIcon;
