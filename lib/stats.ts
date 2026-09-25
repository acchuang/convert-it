// Conversion stats, kept in this browser only (review item 10 and §9's
// failure rate, decided as local-only): per format pair, how many
// conversions finished, how many failed and why (error code, never the
// message or the file), and the average time. Nothing is sent anywhere; the
// Stats panel shows them, and "Copy report" puts a Markdown table on the
// clipboard for someone who chooses to paste it into an issue.
//
// Stats follow the history switch: useJobManager records only while history
// is on, and turning history off deletes these too (lib/history.ts).

import type { ErrorCode } from './errors';
import { readStored, removeStored, writeStored } from './storage';

const STATS_KEY = 'convert-it-stats';

export interface PairStats {
  ok: number;
  failed: number;
  /** Total time of the successful ones, for the average. */
  okMs: number;
  errors: Partial<Record<ErrorCode, number>>;
}

export interface Stats {
  /** ISO date of the first record. */
  since: string;
  pairs: Record<string, PairStats>;
}

export const pairKey = (from: string, to: string) => `${from} → ${to}`;

export function getStats(): Stats | null {
  if (typeof window === 'undefined') return null;
  try {
    const stats = JSON.parse(readStored(STATS_KEY) ?? 'null') as Stats | null;
    return stats && typeof stats.pairs === 'object' ? stats : null;
  } catch {
    return null;
  }
}

export function recordConversion(
  from: string,
  to: string,
  outcome: { ok: true; ms: number } | { ok: false; code: ErrorCode },
): void {
  const stats = getStats() ?? { since: new Date().toISOString(), pairs: {} };
  const pair = (stats.pairs[pairKey(from, to)] ??= { ok: 0, failed: 0, okMs: 0, errors: {} });
  if (outcome.ok) {
    pair.ok++;
    pair.okMs += Math.max(0, Math.round(outcome.ms));
  } else {
    pair.failed++;
    pair.errors[outcome.code] = (pair.errors[outcome.code] ?? 0) + 1;
  }
  writeStored(STATS_KEY, JSON.stringify(stats));
}

export function clearStats(): void {
  removeStored(STATS_KEY);
}

export interface StatsRow {
  pair: string;
  ok: number;
  failed: number;
  /** Average time of the successful ones, in ms; null if none succeeded. */
  avgMs: number | null;
  /** The most frequent error code, if any failed. */
  topError: ErrorCode | null;
}

/** Rows for display: most-used pairs first. */
export function statsRows(stats: Stats): StatsRow[] {
  return Object.entries(stats.pairs)
    .map(([pair, s]) => {
      const top = Object.entries(s.errors).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      return {
        pair,
        ok: s.ok,
        failed: s.failed,
        avgMs: s.ok ? Math.round(s.okMs / s.ok) : null,
        topError: top ? (top[0] as ErrorCode) : null,
      };
    })
    .sort((a, b) => b.ok + b.failed - (a.ok + a.failed) || a.pair.localeCompare(b.pair));
}

/** A browser's name and major version only ("Chrome 140"), for the report. */
export function browserLabel(ua: string): string {
  // Edge and Opera also say "Chrome/", and Chrome also says "Safari/":
  // the more specific name wins.
  for (const [token, name] of [
    ['Edg', 'Edge'],
    ['OPR', 'Opera'],
    ['Firefox', 'Firefox'],
    ['Chrome', 'Chrome'],
  ] as const) {
    const version = ua.match(new RegExp(`${token}/(\\d+)`));
    if (version) return `${name} ${version[1]}`;
  }
  const safari = ua.match(/Version\/(\d+).*Safari/);
  return safari ? `Safari ${safari[1]}` : 'unknown browser';
}

/** "240 ms" under a second, "1.5 s" above. */
export const formatDuration = (ms: number) =>
  ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

/** The copyable report: a Markdown table, the browser, and nothing else. */
export function statsReport(stats: Stats, browser: string): string {
  const lines = [
    `Convert-it conversion stats since ${stats.since.slice(0, 10)} (${browser})`,
    '',
    '| Pair | Done | Failed | Most common error | Average time |',
    '| --- | ---: | ---: | --- | ---: |',
    ...statsRows(stats).map(
      (r) =>
        `| ${r.pair} | ${r.ok} | ${r.failed} | ${r.topError ?? ''} | ${
          r.avgMs === null ? '' : formatDuration(r.avgMs)
        } |`,
    ),
  ];
  return lines.join('\n') + '\n';
}
