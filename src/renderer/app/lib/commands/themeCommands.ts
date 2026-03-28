import { CommandType } from '@/renderer/app/types';
import electronApi from '@/renderer/app/lib/electronApi';
import { MonoCommand } from './types';

interface ThemeCommandDependencies {
  t: (key: string, options?: any) => string;
  setTheme: (theme: any) => void;
  updatePreference: (preference: any) => void;
  preference: any;
}

export const createThemeCommands = (
  deps: ThemeCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const { t, setTheme, updatePreference, preference } = deps;

  return {
    // Theme Commands
    TOGGLE_THEME_LIGHT: {
      scope: 'GLOBAL',
      title: t('command.toggle_theme_light'),
      icon: 'Sun',
      action: () => {
        setTheme('light');
        updatePreference({ appearance: { ...preference.appearance, theme: 'light' } });
        electronApi.changeAppearance('light');
      }
    },

    TOGGLE_THEME_DARK: {
      scope: 'GLOBAL',
      title: t('command.toggle_theme_dark'),
      icon: 'Moon',
      action: () => {
        setTheme('dark');
        updatePreference({ appearance: { ...preference.appearance, theme: 'dark' } });
        electronApi.changeAppearance('dark');
      }
    },

    TOGGLE_THEME_SYSTEM: {
      scope: 'GLOBAL',
      title: t('command.toggle_theme_system'),
      icon: 'Computer',
      action: () => {
        setTheme('system');
        updatePreference({ appearance: { ...preference.appearance, theme: 'system' } });
        electronApi.changeAppearance('system');
      }
    },

    TOGGLE_THEME_BLACK: {
      scope: 'GLOBAL',
      title: t('command.toggle_theme_black'),
      icon: 'Moon',
      action: () => {
        setTheme('black');
        updatePreference({ appearance: { ...preference.appearance, theme: 'black' } });
        electronApi.changeAppearance('black');
      }
    },

    TOGGLE_THEME_PURE_LIGHT: {
      scope: 'GLOBAL',
      title: t('command.toggle_theme_pure_light'),
      icon: 'Sun',
      action: () => {
        setTheme('pure-light');
        updatePreference({ appearance: { ...preference.appearance, theme: 'pure-light' } });
        electronApi.changeAppearance('pure-light');
      }
    },

    // Density Commands
    TOGGLE_DENSITY_COMPACT: {
      scope: 'GLOBAL',
      title: t('command.toggle_density_compact'),
      icon: 'QueueList',
      action: () => {
        updatePreference({ appearance: { ...preference.appearance, density: 'compact' } });
      }
    },

    TOGGLE_DENSITY_COZY: {
      scope: 'GLOBAL',
      title: t('command.toggle_density_cozy'),
      icon: 'QueueList',
      action: () => {
        updatePreference({ appearance: { ...preference.appearance, density: 'cozy' } });
      }
    }
  };
};
