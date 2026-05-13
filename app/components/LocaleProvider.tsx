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
  t: () => '',
});

let translations: Record<string, Record<string, string>> = {};
let loaded = false;

async function loadTranslations(locale: Locale) {
  if (!translations[locale]) {
    const mod = await import(`@/locales/${locale}.json`);
    translations[locale] = flattenJson(mod.default ?? mod);
  }
}

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
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('convert-it-locale') as Locale | null;
    if (stored && LOCALES.some(l => l.code === stored)) {
      setLocaleState(stored);
    } else {
      // Detect browser language
      const nav = navigator.language;
      if (nav.startsWith('zh')) setLocaleState('zh-TW');
      else if (nav.startsWith('ja')) setLocaleState('ja');
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadTranslations(locale).then(() => setReady(true));
    localStorage.setItem('convert-it-locale', locale);
    document.documentElement.lang = locale;
  }, [locale, mounted]);

  const setLocale = useCallback((l: Locale) => {
    setReady(false);
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] ?? key;
    },
    [locale, ready]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, locales: LOCALES, t }}>
      {ready ? children : children}
    </LocaleContext.Provider>
  );
}
