import type { HistoryEntry } from './types';
import { readStored, writeStored, removeStored } from './storage';

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

export function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
