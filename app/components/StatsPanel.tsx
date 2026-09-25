'use client';

import { useReducer, useState, useSyncExternalStore } from 'react';
import {
  browserLabel,
  clearStats,
  formatDuration,
  getStats,
  statsReport,
  statsRows,
} from '@/lib/stats';
import { ERROR_KEYS } from './JobCard';

const subscribeNever = () => () => {};
// A string snapshot, so useSyncExternalStore sees "unchanged" between reads.
const readStats = () => JSON.stringify(getStats());

// What this browser has converted, by format pair, and how often it failed.
// Kept on this device only (lib/stats.ts); "Copy report" is the one way it
// leaves, and only if the visitor pastes it somewhere.
export function StatsPanel({ t }: { t: (key: string) => string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const snapshot = useSyncExternalStore(subscribeNever, readStats, () => 'null');
  const stats = JSON.parse(snapshot) as ReturnType<typeof getStats>;
  const [copied, setCopied] = useState(false);
  const rows = stats ? statsRows(stats) : [];

  const copy = async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(statsReport(stats, browserLabel(navigator.userAgent)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (no focus, permissions): nothing to report.
    }
  };

  return (
    <details className="mt-6 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
      <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        {t('stats.heading')}
      </summary>
      <div className="mt-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-4">
        <p className="text-[var(--text-muted)] mb-3">{t('stats.note')}</p>
        {rows.length === 0 ? (
          <p className="text-[var(--text-muted)]">{t('stats.empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="py-1 pr-3 font-normal">{t('stats.pair')}</th>
                    <th className="py-1 pr-3 font-normal text-right">{t('stats.done')}</th>
                    <th className="py-1 pr-3 font-normal text-right">{t('stats.failed')}</th>
                    <th className="py-1 pr-3 font-normal">{t('stats.topError')}</th>
                    <th className="py-1 font-normal text-right">{t('stats.avgTime')}</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  {rows.map((row) => (
                    <tr key={row.pair} className="border-t border-[var(--border-primary)]">
                      <td className="py-1 pr-3 uppercase">{row.pair}</td>
                      <td className="py-1 pr-3 text-right">{row.ok}</td>
                      <td
                        className={`py-1 pr-3 text-right ${row.failed ? 'text-[var(--error)]' : ''}`}
                      >
                        {row.failed}
                      </td>
                      <td className="py-1 pr-3">
                        {row.topError ? t(`errors.${ERROR_KEYS[row.topError]}.title`) : ''}
                      </td>
                      <td className="py-1 text-right">
                        {row.avgMs === null ? '' : formatDuration(row.avgMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={copy}
                className="text-[var(--accent-ink)] hover:underline"
                aria-live="polite"
              >
                {copied ? t('job.copied') : t('stats.copy')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearStats();
                  rerender();
                }}
                className="text-[var(--text-muted)] hover:text-[var(--error)]"
              >
                {t('stats.reset')}
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
