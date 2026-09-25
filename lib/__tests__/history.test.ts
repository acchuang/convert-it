import { beforeEach, describe, expect, it } from 'vitest';
import { addHistoryEntry, getHistory, historyEnabled, setHistoryEnabled } from '@/lib/history';

const entry = {
  filename: 'divorce-settlement.pdf',
  sourceExt: 'pdf',
  targetExt: 'txt',
  convertedAt: new Date().toISOString(),
  fileSize: 1,
  resultSize: 1,
};

beforeEach(() => localStorage.clear());

describe('history on/off', () => {
  it('is on by default and keeps entries', () => {
    expect(historyEnabled()).toBe(true);
    addHistoryEntry(entry);
    expect(getHistory()).toHaveLength(1);
  });

  it('off: deletes what was kept and writes nothing more, across reloads', () => {
    addHistoryEntry(entry);
    setHistoryEnabled(false);
    expect(getHistory()).toEqual([]);
    addHistoryEntry(entry);
    expect(getHistory()).toEqual([]);
    expect(JSON.stringify({ ...localStorage })).not.toContain('divorce');
    expect(historyEnabled()).toBe(false);
  });

  it('back on: records again', () => {
    setHistoryEnabled(false);
    setHistoryEnabled(true);
    addHistoryEntry(entry);
    expect(getHistory()).toHaveLength(1);
  });
});
