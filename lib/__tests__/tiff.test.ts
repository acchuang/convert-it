// @vitest-environment node
// The real UTIF decoder on TIFFs written by a third party (Pillow; see
// fixtures/tiff/README.md): each compression and colour model we claim.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class NodeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

let decodeTiff: typeof import('@/lib/tiff').decodeTiff;

beforeAll(async () => {
  vi.stubGlobal('ImageData', NodeImageData);
  ({ decodeTiff } = await import('@/lib/tiff'));
});

const fixture = (name: string) =>
  new Blob([readFileSync(join(__dirname, 'fixtures', 'tiff', name))]);

/** RGBA at (x, y). */
const at = (img: ImageData, x: number, y: number) =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

// The colour fixtures are 24×16 quadrants: red, green / blue, white.
const QUADS: [number, number, number[]][] = [
  [2, 2, [255, 0, 0, 255]],
  [20, 2, [0, 255, 0, 255]],
  [2, 13, [0, 0, 255, 255]],
  [20, 13, [255, 255, 255, 255]],
];

function expectQuads(img: ImageData, tolerance = 0) {
  expect([img.width, img.height]).toEqual([24, 16]);
  for (const [x, y, rgba] of QUADS) {
    at(img, x, y).forEach((v, i) => expect(Math.abs(v - rgba[i])).toBeLessThanOrEqual(tolerance));
  }
}

describe('decodeTiff', () => {
  it('reads LZW RGB', async () => {
    expectQuads(await decodeTiff(fixture('rgb-lzw.tiff')));
  });

  it('reads JPEG-compressed RGB', async () => {
    expectQuads(await decodeTiff(fixture('rgb-jpeg.tiff')), 24);
  });

  it('reads PackBits CMYK as RGB', async () => {
    expectQuads(await decodeTiff(fixture('cmyk-packbits.tiff')), 2);
  });

  it('reads Deflate RGBA and keeps the alpha', async () => {
    const img = await decodeTiff(fixture('rgba-deflate.tiff'));
    expect(at(img, 2, 2)[3]).toBe(0);
    expect(at(img, 2, 13)).toEqual([0, 0, 255, 255]);
  });

  it('reads CCITT G4 bilevel (fax, scans)', async () => {
    const img = await decodeTiff(fixture('bilevel-g4.tiff'));
    expect([img.width, img.height]).toEqual([24, 16]);
    expect(at(img, 2, 8)).toEqual([0, 0, 0, 255]);
    expect(at(img, 20, 8)).toEqual([255, 255, 255, 255]);
  });

  it('reads 16-bit grey, scaled to 8', async () => {
    const img = await decodeTiff(fixture('grey16.tiff'));
    expect(at(img, 0, 0).slice(0, 3)).toEqual([0, 0, 0]);
    expect(at(img, 23, 0).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it('takes the first page of a multi-page file', async () => {
    expectQuads(await decodeTiff(fixture('two-pages.tiff')));
  });

  it('fails as corrupt input on bytes that are not a TIFF', async () => {
    await expect(decodeTiff(new Blob(['II*\0garbage']))).rejects.toMatchObject({
      code: 'corrupt-input',
    });
  });
});
