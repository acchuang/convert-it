import { beforeEach, describe, expect, it } from 'vitest';
import {
  browserLabel,
  clearStats,
  getStats,
  recordConversion,
  statsReport,
  statsRows,
} from '@/lib/stats';
import { setHistoryEnabled } from '@/lib/history';

beforeEach(() => localStorage.clear());

describe('local conversion stats', () => {
  it('counts per pair: done with time, failed by error code', () => {
    recordConversion('png', 'webp', { ok: true, ms: 300 });
    recordConversion('png', 'webp', { ok: true, ms: 500 });
    recordConversion('png', 'webp', { ok: false, code: 'corrupt-input' });
    recordConversion('mp4', 'webm', { ok: false, code: 'out-of-memory' });
    recordConversion('mp4', 'webm', { ok: false, code: 'out-of-memory' });
    recordConversion('mp4', 'webm', { ok: false, code: 'engine-load' });
    expect(statsRows(getStats()!)).toEqual([
      { pair: 'mp4 → webm', ok: 0, failed: 3, avgMs: null, topError: 'out-of-memory' },
      { pair: 'png → webp', ok: 2, failed: 1, avgMs: 400, topError: 'corrupt-input' },
    ]);
  });

  it('keeps nothing about the files themselves', () => {
    recordConversion('pdf', 'txt', { ok: true, ms: 10 });
    expect(Object.keys(localStorage)).toEqual(['convert-it-stats']);
    expect(localStorage.getItem('convert-it-stats')).not.toMatch(/name|size|\.pdf/);
  });

  it('the report is a Markdown table plus the browser, nothing else', () => {
    recordConversion('png', 'jpg', { ok: true, ms: 1500 });
    const report = statsReport(getStats()!, 'Chrome 140');
    expect(report).toMatch(/^Convert-it conversion stats since \d{4}-\d\d-\d\d \(Chrome 140\)\n/);
    expect(report).toContain('| png → jpg | 1 | 0 |  | 1.5 s |');
    recordConversion('csv', 'json', { ok: true, ms: 42 });
    expect(statsReport(getStats()!, 'x')).toContain('| csv → json | 1 | 0 |  | 42 ms |');
  });

  it('turning history off deletes them; reset clears them', () => {
    recordConversion('png', 'jpg', { ok: true, ms: 1 });
    setHistoryEnabled(false);
    expect(getStats()).toBeNull();
    setHistoryEnabled(true);
    recordConversion('png', 'jpg', { ok: true, ms: 1 });
    clearStats();
    expect(getStats()).toBeNull();
  });

  it('browserLabel keeps the name and major version only', () => {
    const chrome =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.80 Safari/537.36';
    expect(browserLabel(chrome)).toBe('Chrome 140');
    expect(browserLabel(`${chrome} Edg/140.0.1`)).toBe('Edge 140');
    expect(browserLabel('Mozilla/5.0 (Macintosh) Version/18.2 Safari/605.1.15')).toBe('Safari 18');
    expect(browserLabel('Mozilla/5.0 Firefox/142.0')).toBe('Firefox 142');
  });
});
