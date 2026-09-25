'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { LanguageSelector } from './LanguageSelector';
import { useLocale } from './LocaleProvider';

export function AppHeader() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();
  return (
    <header
      className="border-b border-app px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--header-bg)' }}
      role="banner"
    >
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
        className="text-2xl sm:text-3xl tracking-wide whitespace-nowrap"
      >
        <span className="text-[var(--accent-ink)]">Convert</span>
        <span className="text-[var(--text-primary)]">-it</span>
      </motion.div>

      <div className="flex items-center gap-1.5 sm:gap-4">
        <LanguageSelector />

        <button
          onClick={toggleTheme}
          className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-ink)] hover:bg-[var(--bg-tertiary)] transition-all"
          aria-label={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
          title={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
        >
          {theme === 'dark' ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        {/* About */}
        <Link
          href="/about"
          className="text-xs px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('header.about')}
        </Link>

        {/* Buy Me a Coffee */}
        <a
          href="https://buymeacoffee.com/acchuang"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[#FF813F] hover:bg-[var(--bg-tertiary)] transition-all"
          aria-label={t('header.buyCoffee')}
          title={t('header.buyCoffee')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 8h-1V6c0-2.21-1.79-4-4-4H4c-2.21 0-4 1.79-4 4v10c0 2.21 1.79 4 4 4h11c2.21 0 4-1.79 4-4v-1h1c1.66 0 3-1.34 3-3v-1c0-1.66-1.34-3-3-3zm-9 10H4V6h7v12zm9-3h-1V9h1c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1z" />
          </svg>
        </a>

        {/* GitHub link */}
        <a
          href="https://github.com/acchuang/convert-it"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
          aria-label={t('header.github')}
          title={t('header.github')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
