import { UniqueIdentifier } from '@dnd-kit/core';
import { UUID } from 'crypto';

export type MonoUUID = UUID | string | number | UniqueIdentifier;

export type CommandType =
  | 'SEARCH'
  | 'PIN_CONTACT'
  | 'REMINDER'
  | 'SPACE'
  | 'LABEL'
  | 'MOVE'
  | 'GOTO_IMPORTANT'
  | 'GOTO_DONE'
  | 'GOTO_STARRED'
  | 'GOTO_SENT'
  | 'GOTO_DRAFTS'
  | 'COMPOSE_NEW_MESSAGE'
  | 'COMPOSE_REPLY_MESSAGE'
  | 'COMPOSE_FORWARD_MESSAGE'
  | 'DISCARD_DRAFT'
  | 'SIDEBAR_FAVORITE_ADD'
  // | 'THREAD_MARK_IMPORTANT'
  | 'THREAD_REPORT_SPAM'
  // | 'THREAD_DELETE'
  // | 'THREAD_SNOOZE'
  // | 'THREAD_LABEL'
  // | 'THREAD_MOVE_TO'
  | 'THREAD_MARK_READ'
  | 'THREAD_MARK_UNREAD'
  | 'THREAD_STAR'
  | 'THREAD_UNSTAR'
  | 'THREAD_DONE'
  | 'THREAD_UNDONE'
  | 'THREAD_TRASH'
  | 'THREAD_UNTRASH'
  | 'THREAD_SELECT_ALL'
  | 'THREAD_SELECT_NONE'
  | 'THREAD_SELECT_READ'
  | 'THREAD_SELECT_UNREAD'
  | 'THREAD_SELECT_STARRED'
  | 'THREAD_SELECT_UNSTARRED'
  | 'OPEN_PREFERENCES'
  | 'OPEN_PREFERENCES_TEMPLATE'
  | 'OPEN_PREFERENCES_SIGNATURE'
  | 'OPEN_PREFERENCES_SHORTCUT'
  | 'OPEN_PREFERENCES_GENERAL'
  | 'OPEN_PREFERENCES_NOTIFICATIONS'

  // Email Settings
  | 'OPEN_PREFERENCES_INTEGRATION'
  | 'OPEN_PREFERENCES_COMPOSE'
  | 'OPEN_PREFERENCES_LABEL'

  // Display Settings
  | 'OPEN_PREFERENCES_ACCOUNT'
  | 'OPEN_PREFERENCES_INBOX'

  // Profile & System
  | 'OPEN_PREFERENCES_PROFILE'
  | 'OPEN_PREFERENCES_SYSTEM'

  // Quick Settings
  | 'OPEN_PREFERENCES_APPEARANCE'
  | 'OPEN_PREFERENCES_KEYBOARD'

  // Category Access
  | 'OPEN_EMAIL_SETTINGS'
  | 'OPEN_DISPLAY_SETTINGS'
  | 'OPEN_FEEDBACK'
  | 'OPEN_LOG_FOLDER'
  | 'TOGGLE_DENSITY_COZY'
  | 'TOGGLE_DENSITY_COMPACT'
  | 'TOGGLE_THEME_LIGHT'
  | 'TOGGLE_THEME_PURE_LIGHT'
  | 'TOGGLE_THEME_DARK'
  | 'TOGGLE_THEME_BLACK'
  | 'TOGGLE_THEME_SYSTEM';

// Define the available filter types
export type FilterType =
  | 'read_status'
  | 'attachment'
  | 'calendar'
  | 'label'
  | 'from'
  | 'to'
  | 'cc'
  | 'bcc'
  | 'subject'
  | 'date';

// Define the filter criteria
export interface FilterCriteria {
  type: FilterType;
  operator: 'contains' | 'does_not_contain' | 'is' | 'is_not' | 'has' | 'does_not_have';
  value?: string;
}
