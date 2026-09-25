import { describe, expect, it } from 'vitest';
import { activePreset, IMAGE_PRESETS, VIDEO_PRESETS } from '@/lib/presets';
import { DEFAULT_SETTINGS } from '@/lib/types';

describe('presets', () => {
  it('the defaults are "Balanced" video and "Full" images', () => {
    expect(activePreset(VIDEO_PRESETS, DEFAULT_SETTINGS)).toBe('balanced');
    expect(activePreset(IMAGE_PRESETS, DEFAULT_SETTINGS)).toBe('full');
  });

  it('each preset is recognised once applied', () => {
    for (const presets of [VIDEO_PRESETS, IMAGE_PRESETS]) {
      for (const p of presets) {
        expect(activePreset(presets, { ...DEFAULT_SETTINGS, ...p.patch })).toBe(p.id);
      }
    }
  });

  it('a hand-tuned knob is "custom"', () => {
    expect(activePreset(VIDEO_PRESETS, { ...DEFAULT_SETTINGS, videoQuality: 26 })).toBeNull();
    expect(activePreset(IMAGE_PRESETS, { ...DEFAULT_SETTINGS, imageResizePercent: 50 })).toBeNull();
  });
});
