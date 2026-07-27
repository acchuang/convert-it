'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore } from 'react';
import { readStored, writeStored } from '@/lib/storage';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'convert-it-theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readTheme(): Theme {
  const stored = readStored(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// The static export prerenders without a browser, so the first paint is always dark.
function serverTheme(): Theme {
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', theme === 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0A0A0A' : '#FAFAFA');
    }
  }, [theme]);

  const toggle = useCallback(() => {
    writeStored(STORAGE_KEY, readTheme() === 'dark' ? 'light' : 'dark');
    listeners.forEach(fn => fn());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
