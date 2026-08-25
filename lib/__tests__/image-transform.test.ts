import { describe, it, expect } from 'vitest';
import { planImageTransform } from '@/lib/image-encode';
import { DEFAULT_SETTINGS } from '@/lib/types';
import type { ConversionSettings } from '@/lib/types';

function settings(patch: Partial<ConversionSettings> = {}): ConversionSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('planImageTransform', () => {
  it('returns null when nothing is configured', () => {
    expect(planImageTransform(800, 600, settings())).toBeNull();
  });

  it('scales by percent', () => {
    expect(planImageTransform(800, 600, settings({ imageResizePercent: 50 }))).toEqual({
      crop: undefined,
      width: 400,
      height: 300,
    });
  });

  it('derives the missing dimension from the aspect ratio', () => {
    expect(planImageTransform(800, 600, settings({ imageResizeWidth: 400 }))).toMatchObject({
      width: 400,
      height: 300,
    });
    expect(planImageTransform(800, 600, settings({ imageResizeHeight: 150 }))).toMatchObject({
      width: 200,
      height: 150,
    });
  });

  it('lets explicit dimensions win over percent, and does not force the ratio', () => {
    const plan = planImageTransform(
      800,
      600,
      settings({ imageResizePercent: 50, imageResizeWidth: 300, imageResizeHeight: 300 }),
    );
    expect(plan).toMatchObject({ width: 300, height: 300 });
  });

  it('centre-crops to the requested aspect, trimming the longer axis', () => {
    // 16:9 out of 4:3 is limited by height.
    expect(planImageTransform(800, 600, settings({ imageCropAspect: '16:9' }))).toEqual({
      crop: { x: 0, y: 75, width: 800, height: 450 },
      width: 800,
      height: 450,
    });
    // 1:1 out of a landscape frame is limited by width.
    expect(planImageTransform(800, 600, settings({ imageCropAspect: '1:1' }))).toEqual({
      crop: { x: 100, y: 0, width: 600, height: 600 },
      width: 600,
      height: 600,
    });
  });

  it('resizes relative to the cropped image, not the original', () => {
    expect(
      planImageTransform(800, 600, settings({ imageCropAspect: '1:1', imageResizePercent: 50 })),
    ).toEqual({
      crop: { x: 100, y: 0, width: 600, height: 600 },
      width: 300,
      height: 300,
    });
  });

  it('never plans a zero-pixel image', () => {
    expect(planImageTransform(800, 600, settings({ imageResizePercent: 0.05 }))).toMatchObject({
      width: 1,
      height: 1,
    });
  });
});
