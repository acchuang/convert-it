import { describe, it, expect, vi, afterEach } from 'vitest';
import convertAvif from '@/lib/avif-converter';

// jsdom can't fetch the jSquash WASM at runtime; stub the encode/init surface.
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

describe('convertAvif', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts AVIF to PNG', async () => {
    const bitmap = { width: 10, height: 10, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const ctx = document.createElement('canvas').getContext('2d')!;
    vi.spyOn(Object.getPrototypeOf(ctx), 'drawImage').mockImplementation(vi.fn());

    const file = new File(['fake-avif'], 'test.avif', { type: 'image/avif' });
    const result = await convertAvif(file, 'png');
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts AVIF to ICO', async () => {
    const bitmap = { width: 64, height: 64, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const ctx = document.createElement('canvas').getContext('2d')!;
    vi.spyOn(Object.getPrototypeOf(ctx), 'drawImage').mockImplementation(vi.fn());

    const file = new File(['fake-avif'], 'test.avif', { type: 'image/avif' });
    const result = await convertAvif(file, 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });

  it('rejects on corrupt AVIF', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('corrupt')));
    const file = new File(['bad'], 'bad.avif', { type: 'image/avif' });
    await expect(convertAvif(file, 'png')).rejects.toThrow('AVIF decode failed');
  });
});
