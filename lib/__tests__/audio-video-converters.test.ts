import { describe, it, expect } from 'vitest';
import { getTargetFormats } from '@/lib/converters';

describe('VIDEO_CONVERSIONS includes webp', () => {
  const videoSources = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v', '3gp'];
  for (const source of videoSources) {
    it(`${source} can convert to webp`, () => {
      const targets = getTargetFormats(source);
      expect(targets).toContain('webp');
    });
  }
});
