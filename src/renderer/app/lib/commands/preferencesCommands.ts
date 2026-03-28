import { CommandType } from '@/renderer/app/types';
import { MonoCommand } from './types';

interface PreferencesCommandDependencies {
  t: (key: string, options?: any) => string;
  openDialog: (dialog: any, options?: any) => void;
}

export const createPreferencesCommands = (
  deps: PreferencesCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const { t, openDialog } = deps;

  return {
    OPEN_PREFERENCES: {
      scope: 'GLOBAL',
      title: t('command.open_preferences'),
      hotkeys: ['MOD+COMMA', 'MOD+OPTION+COMMA'],
      icon: 'Cog',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'general' });
      }
    },

    OPEN_PREFERENCES_SHORTCUT: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_shortcut'),
      hotkeys: ['?', 'SHIFT+?'],
      icon: 'Command',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'shortcut' });
      }
    },

    OPEN_PREFERENCES_BILLING: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_billing'),
      icon: 'Billing',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'billing' });
      }
    },

    OPEN_PREFERENCES_SIGNATURE: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_signature'),
      icon: 'Signature',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'signature' });
      }
    },

    OPEN_PREFERENCES_TEMPLATE: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_template'),
      icon: 'ScrollText',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'template' });
      }
    },

    // General Settings Commands
    OPEN_PREFERENCES_GENERAL: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_general'),
      icon: 'Cog',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'general' });
      }
    },

    OPEN_PREFERENCES_NOTIFICATIONS: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_notifications'),
      icon: 'Bell',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'notifications' });
      }
    },

    // Email Settings Commands
    OPEN_PREFERENCES_INTEGRATION: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_integration'),
      icon: 'UserGroup',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'integration' });
      }
    },

    OPEN_PREFERENCES_COMPOSE: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_compose'),
      icon: 'Edit',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'compose' });
      }
    },

    OPEN_PREFERENCES_LABEL: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_label'),
      icon: 'Label',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'label' });
      }
    },

    // AI Settings Commands
    OPEN_PREFERENCES_FILTER: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_filter'),
      icon: 'Filter',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'filter' });
      }
    },

    OPEN_PREFERENCES_AUTOPILOT: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_autopilot'),
      icon: 'Sparkles',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'autopilot' });
      }
    },

    // Display Settings Commands
    OPEN_PREFERENCES_ACCOUNT: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_account'),
      icon: 'UserCircle',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'account' });
      }
    },

    OPEN_PREFERENCES_INBOX: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_inbox'),
      icon: 'Inbox',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'inbox' });
      }
    },

    // Profile & System Commands
    OPEN_PREFERENCES_PROFILE: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_profile'),
      icon: 'UserIcon',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'profile' });
      }
    },

    OPEN_PREFERENCES_SYSTEM: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_system'),
      icon: 'Cog',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'system' });
      }
    },

    // Quick Settings Commands
    OPEN_PREFERENCES_APPEARANCE: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_appearance'),
      icon: 'Heart',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'general' }); // Assuming appearance is in general
      }
    },

    OPEN_PREFERENCES_KEYBOARD: {
      scope: 'GLOBAL',
      title: t('command.open_preferences_keyboard'),
      icon: 'Keyboard',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'shortcut' });
      }
    },

    // Quick Access to Specific Settings Sections
    OPEN_EMAIL_SETTINGS: {
      scope: 'GLOBAL',
      title: t('command.open_email_settings'),
      icon: 'Envelope',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'integration' });
      }
    },

    OPEN_AI_SETTINGS: {
      scope: 'GLOBAL',
      title: t('command.open_ai_settings'),
      icon: 'Sparkles',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'autopilot' });
      }
    },

    OPEN_DISPLAY_SETTINGS: {
      scope: 'GLOBAL',
      title: t('command.open_display_settings'),
      icon: 'Computer',
      action: (_: any) => {
        openDialog('preference', { defaultPage: 'account' });
      }
    }
  };
};
