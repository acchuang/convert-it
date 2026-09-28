import type { HistoryEntry } from './types';
import { readStored, writeStored, removeStored } from './storage';
import { clearStats } from './stats';

const HISTORY_KEY = 'convert-it-history';
const MAX_ENTRIES = 30;
// Set when the visitor turns history off: then nothing about their files is
// written at all (file names can be sensitive).
const HISTORY_OFF_KEY = 'convert-it-history-off';

export type { HistoryEntry } from './types';

export function getHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(readStored(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function historyEnabled(): boolean {
  return typeof window === 'undefined' || readStored(HISTORY_OFF_KEY) !== '1';
}

/** Turning history off also deletes what was kept. */
export function setHistoryEnabled(on: boolean): void {
  if (on) {
    removeStored(HISTORY_OFF_KEY);
  } else {
    writeStored(HISTORY_OFF_KEY, '1');
    clearHistory();
    clearStats();
  }
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): void {
  if (!historyEnabled()) return;
  const history = getHistory();
  history.unshift({ ...entry, id: crypto.randomUUID() });
  if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES);
  writeStored(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  removeStored(HISTORY_KEY);
}

/** "3 minutes ago", in the page's language (Intl does the wording). */
export function timeAgo(isoDate: string, locale = 'en'): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (seconds < 60) return format.format(0, 'second');
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return format.format(-Math.floor(seconds / 3600), 'hour');
  return format.format(-Math.floor(seconds / 86400), 'day');
}
