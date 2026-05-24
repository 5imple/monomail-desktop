import { AudioType } from '@/renderer/app/lib/soundManager';

export type NotificationType = 'PRIMARY' | 'INBOX' | 'OFF';

export type SplitCategoryPreferences = {
  showUpdates: boolean;
  showSocial: boolean;
  showPromotions: boolean;
  showForums: boolean;
};

export type ThreadListDisplayPreferences = {
  showAvatar: boolean;
  showSnippet: boolean;
  showLabels: boolean;
  showAttachments: boolean;
};
// User preference interface
export interface UserPreference {
  appearance: {
    theme: 'light' | 'dark' | 'black' | 'pure-light' | 'system';
    density: 'compact' | 'cozy'; // 1: compact, 2: cozy
  };
  compose: {
    cancelWindow: number;
    fullscreen: boolean;
  };
  account: {
    accentColor: Record<string, string>;
  };
  signature: {
    includeInReplies: boolean;
    includeInForwards: boolean;
    includeInNewMessages: boolean;
  };
  display: {
    inbox: {
      category: Record<string, SplitCategoryPreferences>;
    };
    threadList: ThreadListDisplayPreferences;
  };
  notification: {
    alertSound: AudioType;
    watchNotification: Record<string, NotificationType>;
    marketingEmails: boolean;
    securityEmails: boolean;
  };
  system: {
    openAtLogin: boolean;
  };
}

// User account interface
export interface MonoAccount {
  uid: string;
  displayName: string;
  provider: 'google' | 'microsoft';
  email: string;
  profileImageUrl: string;
  primary: boolean;
  scopes: string[];
  isExpired: boolean;
}

// Local signed-in profile, derived from the Google account. Not a server-side
// "Mono account" — just the fields the UI needs to render the active member.
export interface MonoMember {
  uid: string;
  displayName: string;
  email: string;
  primaryUid: string;
  memberName: string;
  profileImageUrl: string;
}

// Response type with modified structure
export type GetMonoAccountResponse = {
  member?: MonoMember;
  accounts: MonoAccount[];
};
