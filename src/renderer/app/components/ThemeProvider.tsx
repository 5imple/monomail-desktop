import electronApi from '@/renderer/app/lib/electronApi';
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'black' | 'pure-light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  currentTheme?: 'dark' | 'light' | 'black' | 'pure-light';
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  currentTheme: 'dark' | 'light' | 'black' | 'pure-light';
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'light',
  currentTheme: 'light', // Default current theme
  setTheme: () => null
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
ThemeProviderContext.displayName = 'ThemeProviderContext';
export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  const getCurrentSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light' | 'black' | 'pure-light'>(
    () => {
      if (theme === 'system') {
        return getCurrentSystemTheme();
      }
      electronApi.changeAppearance(theme);
      return theme;
    }
  );

  useEffect(() => {
    const root = window.document.documentElement;

    const systemTheme = getCurrentSystemTheme();
    root.classList.remove('light', 'dark', 'black', 'pure-light');

    if (theme === 'system') {
      root.classList.add(systemTheme);
      setCurrentTheme(systemTheme);
    } else {
      if (theme === 'pure-light') {
        root.classList.add('pure-light');
        setCurrentTheme('pure-light');
      } else {
        if (theme === 'black') {
          root.classList.add('dark', 'black');
          setCurrentTheme('black');
        } else {
          root.classList.add(theme);
          setCurrentTheme(theme);
        }
      }
    }
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (theme === 'system') {
        const newSystemTheme = event.matches ? 'dark' : 'light';
        setCurrentTheme(newSystemTheme);
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark', 'black', 'pure-light');
        root.classList.add(newSystemTheme);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    // Cleanup listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme]);

  const value = {
    theme,
    currentTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    }
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
