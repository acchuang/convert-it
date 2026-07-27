'use client';

import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import en from '@/locales/en.json';
import { readStored, writeStored } from '@/lib/storage';

export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'es';

const STORAGE_KEY = 'convert-it-locale';

const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
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
  t: (k) => EN_MESSAGES[k] ?? k,
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

// Seeded with English rather than {} so the prerendered HTML — and the first paint
// before the locale chunk loads — shows real copy instead of raw keys like "dropzone.title".
const EN_MESSAGES = flattenJson(en);

export function useLocale() {
  return useContext(LocaleContext);
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readLocale(): Locale {
  const stored = LOCALES.find(l => l.code === readStored(STORAGE_KEY));
  if (stored) return stored.code;

  const nav = navigator.language;
  if (nav === 'zh-CN' || nav === 'zh-SG' || nav.startsWith('zh-Hans')) return 'zh-CN';
  if (nav.startsWith('zh')) return 'zh-TW';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('es')) return 'es';
  return 'en';
}

// The static export prerenders without a browser, so the first paint is always English.
function serverLocale(): Locale {
  return 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, serverLocale);
  const [messages, setMessages] = useState<Record<string, string>>(EN_MESSAGES);

  // Load translations when locale changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const mod = await import(`@/locales/${locale}.json`);
      if (!cancelled) {
        setMessages(flattenJson(mod.default ?? mod));
      }
    }

    load();
    document.documentElement.lang = locale;

    return () => { cancelled = true; };
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    writeStored(STORAGE_KEY, l);
    listeners.forEach(fn => fn());
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
