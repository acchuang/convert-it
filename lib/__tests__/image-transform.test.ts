import { describe, it, expect } from 'vitest';
import { planImageTransform, transformImageData } from '@/lib/image-encode';
import { DEFAULT_SETTINGS } from '@/lib/types';
import type { ConversionSettings } from '@/lib/types';

function settings(patch: Partial<ConversionSettings> = {}): ConversionSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('planImageTransform', () => {
  it('caps the longest side, never enlarging', () => {
    expect(planImageTransform(4000, 3000, settings({ imageMaxSide: 2048 }))).toMatchObject({
      width: 2048,
      height: 1536,
    });
    expect(planImageTransform(3000, 4000, settings({ imageMaxSide: 1280 }))).toMatchObject({
      width: 960,
      height: 1280,
    });
    expect(planImageTransform(800, 600, settings({ imageMaxSide: 2048 }))).toBeNull();
  });

  it('applies the cap after the other resizes and the crop', () => {
    expect(
      planImageTransform(4000, 3000, settings({ imageResizePercent: 50, imageMaxSide: 1280 })),
    ).toMatchObject({ width: 1280, height: 960 });
    expect(
      planImageTransform(4000, 3000, settings({ imageCropAspect: '1:1', imageMaxSide: 1000 })),
    ).toMatchObject({ crop: { width: 3000, height: 3000 }, width: 1000, height: 1000 });
  });

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

describe('transformImageData downscaling', () => {
  // One-pixel black/white stripes: the worst case for downscaling. A resampler
  // that skips source pixels lands on black or white bands instead of the true
  // average grey.
  function stripes(size: number): ImageData {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let yy = 0; yy < size; yy++) {
      for (let xx = 0; xx < size; xx++) {
        const v = xx % 2 === 0 ? 0 : 255;
        const i = (yy * size + xx) * 4;
        data.set([v, v, v, 255], i);
      }
    }
    return new ImageData(data, size, size);
  }

  it('averages fine detail instead of aliasing when shrinking 16×', () => {
    const out = transformImageData(stripes(256), { width: 16, height: 16 });
    expect([out.width, out.height]).toEqual([16, 16]);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(Math.abs(out.data[i] - 127.5)).toBeLessThan(20);
    }
  });

  it('crops then resizes, and handles non-power-of-two sizes', () => {
    const out = transformImageData(stripes(300), {
      crop: { x: 10, y: 20, width: 250, height: 100 },
      width: 37,
      height: 11,
    });
    expect([out.width, out.height]).toEqual([37, 11]);
  });

  it('upscales', () => {
    const out = transformImageData(stripes(4), { width: 40, height: 40 });
    expect([out.width, out.height]).toEqual([40, 40]);
  });
});
