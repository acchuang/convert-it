import { describe, it, expect, vi, afterEach } from 'vitest';

const { mockDecode } = vi.hoisted(() => ({
  mockDecode: vi.fn(),
}));

vi.mock('libheif-js', () => ({
  default: {
    HeifDecoder: vi.fn(function (this: any) {
      this.decode = mockDecode;
    }),
  },
}));

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

import convertHeic from '@/lib/heic-converter';

describe('convertHeic', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('converts HEIC to JPEG', async () => {
    mockDecode.mockReturnValue([
      {
        get_width: () => 100,
        get_height: () => 100,
        display: vi.fn().mockImplementation((imageData: ImageData) => {
          imageData.data.set(new Uint8Array(40000).fill(128));
        }),
      },
    ]);

    const blob = new Blob(['fake-heic-data'], { type: 'image/heic' });
    const file = new File([blob], 'test.heic', { type: 'image/heic' });
    const result = await convertHeic(file, 'jpg', { quality: 0.9 } as any);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts HEIC to ICO', async () => {
    mockDecode.mockReturnValue([
      {
        get_width: () => 64,
        get_height: () => 64,
        display: vi.fn().mockImplementation((imageData: ImageData) => {
          imageData.data.set(new Uint8Array(16384).fill(128));
        }),
      },
    ]);

    const blob = new Blob(['fake-heic-data'], { type: 'image/heic' });
    const file = new File([blob], 'test.heic', { type: 'image/heic' });
    const result = await convertHeic(file, 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });

  it('throws on corrupt HEIC', async () => {
    mockDecode.mockImplementation(() => {
      throw new Error('corrupt');
    });

    const file = new File(['bad-data'], 'corrupt.heic', { type: 'image/heic' });
    await expect(convertHeic(file, 'png')).rejects.toThrow('HEIC decode failed');
  });
});
