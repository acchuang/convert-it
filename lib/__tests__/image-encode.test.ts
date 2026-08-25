import { describe, it, expect } from 'vitest';
import { encodeBmp } from '@/lib/image-encode';

describe('encodeBmp', () => {
  it('writes a 24-bit BMP with padded, bottom-up BGR rows', () => {
    // 2×2: row 0 = red, green; row 1 = blue, white.
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const out = encodeBmp({ width: 2, height: 2, data } as ImageData);
    const view = new DataView(out.buffer);

    const rowSize = 8; // 2px × 3 bytes = 6, padded up to a 4-byte boundary
    expect(String.fromCharCode(out[0], out[1])).toBe('BM');
    expect(out.length).toBe(54 + rowSize * 2);
    expect(view.getUint32(2, true)).toBe(out.length);
    expect(view.getUint32(10, true)).toBe(54);
    expect(view.getInt32(18, true)).toBe(2);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);

    // Bottom-up: the source's last row lands first, and channels are BGR.
    expect([...out.slice(54, 60)]).toEqual([255, 0, 0, 255, 255, 255]);
    expect([...out.slice(54 + rowSize, 54 + rowSize + 6)]).toEqual([0, 0, 255, 0, 255, 0]);
  });
});
