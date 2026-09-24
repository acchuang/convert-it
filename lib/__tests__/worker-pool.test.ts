import { describe, it, expect } from 'vitest';
import { runsOnMainThread } from '@/lib/worker-pool';

describe('runsOnMainThread', () => {
  it('keeps DOM-bound and ffmpeg work on the main thread', () => {
    expect(runsOnMainThread('html', 'md')).toBe(true);
    expect(runsOnMainThread('html', 'pdf')).toBe(true);
    expect(runsOnMainThread('md', 'pdf')).toBe(true);
    expect(runsOnMainThread('md', 'epub')).toBe(true);
    expect(runsOnMainThread('html', 'epub')).toBe(true);
    expect(runsOnMainThread('mp4', 'webm', 'video')).toBe(true);
    expect(runsOnMainThread('wav', 'mp3', 'audio')).toBe(true);
  });

  it('runs XML and text/JSON → PDF in the worker pool', () => {
    for (const target of ['csv', 'tsv', 'yaml', 'json', 'txt']) {
      expect(runsOnMainThread('xml', target, 'data')).toBe(false);
    }
    expect(runsOnMainThread('txt', 'pdf', 'document')).toBe(false);
    expect(runsOnMainThread('json', 'pdf', 'data')).toBe(false);
    expect(runsOnMainThread('txt', 'epub', 'document')).toBe(false);
    expect(runsOnMainThread('png', 'jpg', 'image')).toBe(false);
  });
});
