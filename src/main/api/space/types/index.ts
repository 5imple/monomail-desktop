import { Contact } from '@/renderer/app/lib/db/contact';

// Type definitions
export interface MonoSpaceResponse {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  pinnedEmails: string[];
  accountUids: string[];
  default: boolean;
}

export interface CreateSpaceRequest {
  uid?: string;
  name: string;
  color: string;
  icon: string;
  accountUids: string[];
}

export interface UpdateSpaceRequest {
  uid?: string;
  name?: string;
  color?: string;
  icon?: string;
}

export interface UpdateSpaceAccountsRequest {
  accountUids: string[];
}

export interface PinResponse {
  uid: string;
  id: string;
  pinnedEmails: string[];
}

export interface AddPinRequest {
  pinnedEmail: string;
}

export interface SpaceContactsResponse {
  contacts: Contact[];
  totalElements: number;
}

// Custom Sidebar API Types
export interface CustomNavItem {
  id: string;
  type: 'primary' | 'secondary' | 'account-label' | 'folder';
  title: string;
  icon: string;
  iconColor?: string;
  query?: string;
  hotkey?: string;
  accountId?: string;
  labelId?: string;
  parentId?: string;
  children?: string[];
  isCollapsed?: boolean;
  position: number;
}

export interface CustomSidebarState {
  items: Record<string, CustomNavItem>;
  order: string[];
}

export interface CustomSidebarResponse {
  id: string;
  spaceId: string;
  sidebarState: CustomSidebarState;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCustomSidebarRequest {
  sidebarState: CustomSidebarState;
}

export interface AddCustomSidebarItemRequest {
  id: string;
  type: 'primary' | 'secondary' | 'account-label' | 'folder';
  title: string;
  icon: string;
  iconColor?: string;
  query?: string;
  hotkey?: string;
  accountId?: string;
  labelId?: string;
  parentId?: string;
  children?: string[];
  isCollapsed?: boolean;
}

export interface CreateCustomSidebarFolderRequest {
  folderId: string;
  folderName: string;
}

export interface ReorderCustomSidebarRequest {
  order: string[];
}

export interface MoveCustomSidebarItemRequest {
  itemId: string;
  folderId?: string | null;
}
