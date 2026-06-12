'use client';

import { type ReactNode } from 'react';
import { useStats, formatCount } from '@/lib/useStats';
import { useLocale } from './LocaleProvider';

interface FooterProps {
  maxWidth?: string;
  navLabel?: string;
  children?: ReactNode;
}

export default function Footer({ maxWidth = 'max-w-5xl', navLabel, children }: FooterProps) {
  const stats = useStats();
  const { t } = useLocale();

  return (
    <footer className="border-t border-[var(--border-primary)] px-6 py-6 mt-16" role="contentinfo">
      <div className={`${maxWidth} mx-auto flex flex-col md:flex-row items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)]">
            {t('footer.copyright')}
          </span>
          {stats && (
            <span
              className="text-xs text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-mono)' }}
              aria-live="polite"
            >
              {formatCount(stats.total)} {t('footer.totalUsers')}
            </span>
          )}
        </div>
        {children && (
          <nav
            className="flex gap-6 text-xs text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
            aria-label={navLabel ?? ''}
          >
            {children}
          </nav>
        )}
      </div>
    </footer>
  );
}
