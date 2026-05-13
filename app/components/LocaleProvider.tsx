'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Locale = 'en' | 'zh-TW' | 'ja';

const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
];

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  locales: typeof LOCALES;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  locales: LOCALES,
  t: (k) => k,
});

function flattenJson(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenJson(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value ?? '');
    }
  }
  return result;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  // Detect initial locale
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('convert-it-locale') as Locale | null;
    if (stored && LOCALES.some(l => l.code === stored)) {
      setLocaleState(stored);
    } else {
      const nav = navigator.language;
      if (nav.startsWith('zh')) setLocaleState('zh-TW');
      else if (nav.startsWith('ja')) setLocaleState('ja');
    }
  }, []);

  // Load translations when locale changes
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    async function load() {
      const mod = await import(`@/locales/${locale}.json`);
      if (!cancelled) {
        const flat = flattenJson(mod.default ?? mod);
        setMessages(flat);
      }
    }

    load();
    localStorage.setItem('convert-it-locale', locale);
    document.documentElement.lang = locale;

    return () => { cancelled = true; };
  }, [locale, mounted]);

  const setLocale = useCallback((l: Locale) => {
    setMessages({});
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string): string => messages[key] ?? key,
    [messages]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, locales: LOCALES, t }}>
      {children}
    </LocaleContext.Provider>
  );
}
