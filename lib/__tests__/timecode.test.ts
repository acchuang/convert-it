import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode } from '@/lib/timecode';

describe('parseTimecode', () => {
  it('reads seconds, m:ss and h:mm:ss, with fractions', () => {
    expect(parseTimecode('90')).toBe(90);
    expect(parseTimecode('1:30')).toBe(90);
    expect(parseTimecode('1:30.5')).toBe(90.5);
    expect(parseTimecode('0:01:30')).toBe(90);
    expect(parseTimecode('1:02:03')).toBe(3723);
    expect(parseTimecode(' 12.25 ')).toBe(12.25);
  });

  it('blank is 0 (no trim); nonsense is null', () => {
    expect(parseTimecode('')).toBe(0);
    for (const bad of ['abc', '1:75', '1::2', '-5', '1:2:3:4', '1.5:00'])
      expect(parseTimecode(bad), bad).toBeNull();
  });
});

describe('formatTimecode', () => {
  it('writes m:ss or h:mm:ss, tenths only when present, blank for 0', () => {
    expect(formatTimecode(0)).toBe('');
    expect(formatTimecode(5)).toBe('0:05');
    expect(formatTimecode(90.5)).toBe('1:30.5');
    expect(formatTimecode(3723)).toBe('1:02:03');
  });

  it('round-trips', () => {
    for (const s of [1, 59.9, 61, 600, 3599.5, 7200])
      expect(parseTimecode(formatTimecode(s))).toBeCloseTo(s, 5);
  });
});
