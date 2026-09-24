// @vitest-environment node
// The real AVIF and JPEG XL codecs (the wasm shipped in public/wasm/), not mocks:
// encode a known image, decode it back, and check it survived.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The emscripten glue builds ImageData for decoded images; Node has none.
class NodeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

let mod: typeof import('@/lib/image-encode');

beforeAll(async () => {
  vi.stubGlobal('ImageData', NodeImageData);
  // locateFile resolves against ASSET_BASE, read at import: point it at the
  // files the site ships, so a missing copy-wasm step fails here too.
  vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', join(process.cwd(), 'public', 'wasm'));
  // The glue fetches its wasm even under Node; serve it from disk.
  vi.stubGlobal(
    'fetch',
    async (path: string) =>
      new Response(readFileSync(String(path)), {
        headers: { 'content-type': 'application/wasm' },
      }),
  );
  vi.resetModules();
  mod = await import('@/lib/image-encode');
});

// 64×48: left half red, right half blue, fully opaque.
function sample(): ImageData {
  const width = 64;
  const height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set(x < width / 2 ? [220, 20, 20, 255] : [20, 20, 220, 255], i);
    }
  return new NodeImageData(data, width, height) as unknown as ImageData;
}

const pixel = (img: ImageData, x: number, y: number) =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

describe('AVIF output', () => {
  it('writes a real AVIF (ftyp avif brand)', async () => {
    const blob = await mod.encodeImageData(sample(), 'avif', 0.92);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('image/avif');
    expect(new TextDecoder().decode(bytes.subarray(4, 12))).toBe('ftypavif');
  }, 30000);

  it('decodes back to the same picture', async () => {
    const blob = await mod.encodeImageData(sample(), 'avif', 0.92);
    // Decoder from node_modules: the app decodes AVIF natively, so it isn't shipped.
    const { default: factory } = await import('@jsquash/avif/codec/dec/avif_dec.js');
    const dec = await (
      factory as (o: object) => Promise<{ decode(b: BufferSource, bitDepth: 8): ImageData }>
    )({
      noInitialRun: true,
      locateFile: (f: string) => join(process.cwd(), 'node_modules/@jsquash/avif/codec/dec', f),
    });
    const back = dec.decode(await blob.arrayBuffer(), 8);
    expect([back.width, back.height]).toEqual([64, 48]);
    const [r1, , b1] = pixel(back, 8, 24);
    const [r2, , b2] = pixel(back, 56, 24);
    expect(r1).toBeGreaterThan(180);
    expect(b1).toBeLessThan(70);
    expect(b2).toBeGreaterThan(180);
    expect(r2).toBeLessThan(70);
  }, 30000);

  it('lower quality gives a smaller file', async () => {
    const hi = await mod.encodeImageData(sample(), 'avif', 0.95);
    const lo = await mod.encodeImageData(sample(), 'avif', 0.3);
    expect(lo.size).toBeLessThan(hi.size);
  }, 30000);
});

describe('JPEG XL', () => {
  it('round-trips through the real encoder and decoder', async () => {
    const blob = await mod.encodeImageData(sample(), 'jxl', 0.92);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('image/jxl');
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0x0a]); // naked codestream signature

    const back = await mod.decodeJxl(blob);
    expect([back.width, back.height]).toEqual([64, 48]);
    const [r1, , b1] = pixel(back, 8, 24);
    const [r2, , b2] = pixel(back, 56, 24);
    expect(r1).toBeGreaterThan(180); // still red on the left…
    expect(b1).toBeLessThan(70);
    expect(b2).toBeGreaterThan(180); // …and blue on the right
    expect(r2).toBeLessThan(70);
  }, 30000);

  it('rejects bytes that are not JPEG XL', async () => {
    await expect(mod.decodeJxl(new Blob([new Uint8Array([1, 2, 3, 4])]))).rejects.toThrow(
      /JPEG XL/,
    );
  });
});

describe('codecQuality', () => {
  it('shifts AVIF so the default 92 % is not near-lossless; JXL tracks JPEG', () => {
    expect(mod.codecQuality('avif', 0.92)).toBe(67);
    expect(mod.codecQuality('avif', 0.1)).toBe(0);
    expect(mod.codecQuality('jxl', 0.92)).toBe(92);
    expect(mod.codecQuality('jxl', 0)).toBe(1);
  });
});
