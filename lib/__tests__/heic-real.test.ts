// @vitest-environment node
// The real libheif (not a mock) on a HEIC with three images, made by
// pillow-heif: red, green, blue, with the green one marked primary.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class NodeImageData {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

const fixture = () =>
  new File(
    [readFileSync(join(__dirname, 'fixtures', 'pillow-heif-3-images-primary-2.heic'))],
    'burst.heic',
  );

// The dominant channel of the middle pixel: 0 red, 1 green, 2 blue.
const colour = (image: { data: Uint8ClampedArray; width: number; height: number }) => {
  const at = ((image.height >> 1) * image.width + (image.width >> 1)) * 4;
  const rgb = [...image.data.subarray(at, at + 3)];
  return rgb.indexOf(Math.max(...rgb));
};

beforeAll(() => vi.stubGlobal('ImageData', NodeImageData));

describe('HEIC with several images (real libheif)', () => {
  it('converts the primary image, not the first in the file', async () => {
    const { decodeHeicToImageData } = await import('@/lib/heic-converter');
    const image = await decodeHeicToImageData(fixture());
    expect([image.width, image.height]).toEqual([64, 48]);
    expect(colour(image)).toBe(1);
  });

  it('all images: primary first, then the rest in file order', async () => {
    // Encoding is someone else's test: tag each image with its colour (as
    // bytes: JSZip under Node can't read a Blob).
    const encode = vi.fn(async (image: ImageData) =>
      new TextEncoder().encode(String(colour(image))),
    );
    vi.doMock('@/lib/image-encode', () => ({ finishImage: encode }));
    vi.doMock('@/lib/image-converters', () => ({
      withMetadata: async (_f: File, _s: string, b: unknown) => b,
    }));
    vi.resetModules();
    const { default: convertHeic } = await import('@/lib/heic-converter');
    const zipBlob = await convertHeic(fixture(), 'png', {
      heicAllImages: true,
    } as never);
    expect(zipBlob.type).toBe('application/zip');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['burst-1.png', 'burst-2.png', 'burst-3.png']);
    const colours = await Promise.all(names.map((n) => zip.file(n)!.async('string')));
    expect(colours).toEqual(['1', '0', '2']);
    vi.doUnmock('@/lib/image-encode');
    vi.doUnmock('@/lib/image-converters');
  });
});
