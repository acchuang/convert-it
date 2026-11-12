import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageToText } from '@/lib/ocr-converters';

const recognize = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ocr', () => ({ recognize }));
vi.mock('@/lib/image-encode', () => ({
  encodeImageData: vi.fn(async () => new Blob([new Uint8Array(4)], { type: 'image/bmp' })),
}));

describe('TIFF to text', () => {
  it('reads every page, a blank line between them', async () => {
    recognize.mockResolvedValueOnce('first page').mockResolvedValueOnce('second page');
    const bytes = readFileSync(join(__dirname, 'fixtures', 'tiff', 'two-pages.tiff'));
    const file = new File([bytes], 'two-pages.tiff', { type: 'image/tiff' });
    const progress: number[] = [];
    const out = await imageToText(file, 'tiff', 'txt', undefined, (p) => progress.push(p));
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(await out.text()).toBe('first page\n\nsecond page\n');
    expect(progress.at(-1)).toBe(100);
  });
});
