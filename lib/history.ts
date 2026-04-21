import type { HistoryEntry } from './types';

const HISTORY_KEY = 'convert-it-history';
const MAX_ENTRIES = 30;

export type { HistoryEntry } from './types';

export function getHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): void {
  const history = getHistory();
  history.unshift({ ...entry, id: crypto.randomUUID() });
  if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
