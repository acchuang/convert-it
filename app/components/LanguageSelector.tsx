'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale, type Locale } from './LocaleProvider';

export function LanguageSelector() {
  const { locale, setLocale, locales } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = locales.find(l => l.code === locale) ?? locales[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
        style={{ fontFamily: 'var(--font-mono)' }}
        aria-label="Select language"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
        <span className="hidden sm:inline">{current.label}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className="absolute right-0 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg py-1 elevation-popover z-50 min-w-[140px]"
          >
            {locales.map(l => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                  locale === l.code
                    ? 'text-[var(--accent)] bg-[var(--accent)]/5'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${locale === l.code ? 'bg-[var(--accent)]' : 'bg-transparent'}`} />
                {l.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
