import { describe, it, expect, vi } from 'vitest';
import { convertImage } from '@/lib/image-converters';

// The WASM codecs are fetched at runtime (see lib/image-encode); in jsdom there
// is no server to serve them, so stub the encode/init surface and exercise the
// converter orchestration instead.
vi.mock('@jsquash/jpeg/encode', () => ({
  init: vi.fn(() => Promise.resolve()),
  default: vi.fn(() => Promise.resolve(new ArrayBuffer(16))),
}));
vi.mock('@jsquash/png/encode', () => ({
  init: vi.fn(() => Promise.resolve()),
  default: vi.fn(() => Promise.resolve(new ArrayBuffer(16))),
}));
vi.mock('@jsquash/webp/encode', () => ({
  init: vi.fn(() => Promise.resolve()),
  default: vi.fn(() => Promise.resolve(new ArrayBuffer(16))),
}));
vi.mock('@jsquash/oxipng/optimise', () => ({
  init: vi.fn(() => Promise.resolve()),
  default: vi.fn((buf) => Promise.resolve(buf)),
}));
// resvg is SVG-only; no SVG test exercises it, but stub it so importing the
// converter never reaches for the real WASM in jsdom.
vi.mock('@resvg/resvg-wasm', () => ({
  initWasm: vi.fn(() => Promise.resolve()),
  Resvg: vi.fn(),
}));

describe('convertImage', () => {
  it('rejects with invalid input (empty file)', async () => {
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    await expect(convertImage(emptyFile, 'png', 'jpg')).rejects.toThrow();
  });

  it('converts JPEG to PNG', async () => {
    const blob = await createTestImageBlob('image/jpeg');
    const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });
    const result = await convertImage(file, 'jpg', 'png');
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to WebP', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to JPEG with quality setting', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'jpg', { quality: 0.5 } as any);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to ICO', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });
});

async function createTestImageBlob(mimeType: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = 'blue';
  ctx.fillRect(1, 1, 1, 1);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Canvas toBlob failed'));
    }, mimeType);
  });
}
