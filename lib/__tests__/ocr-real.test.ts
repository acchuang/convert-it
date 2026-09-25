// @vitest-environment node
// Real tesseract.js with the language data the site ships (public/ocr/lang),
// on text rendered with node-canvas: the OCR path end to end, minus the browser.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createCanvas } from 'canvas';

let ocr: typeof import('@/lib/ocr');

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_OCR_BASE', join(process.cwd(), 'public', 'ocr'));
  vi.resetModules();
  ocr = await import('@/lib/ocr');
});
afterAll(() => ocr.terminateOcr());

function textImage(lines: string[], font = '40px sans-serif'): Blob {
  const canvas = createCanvas(900, 90 + lines.length * 60);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.font = font;
  lines.forEach((line, i) => ctx.fillText(line, 40, 80 + i * 60));
  return new Blob([new Uint8Array(canvas.toBuffer('image/png'))], { type: 'image/png' });
}

describe('OCR (real tesseract, shipped language data)', () => {
  it('reads English', async () => {
    const progress: number[] = [];
    const text = await ocr.recognize(
      textImage(['The quick brown fox', 'jumps over 13 lazy dogs']),
      'eng',
      (f) => progress.push(f),
    );
    expect(text).toMatch(/quick brown fox/);
    expect(text).toMatch(/jumps over 13 lazy dogs/);
    expect(progress.at(-1)).toBe(1);
  }, 60000);

  it('switches language (Spanish accents)', async () => {
    const text = await ocr.recognize(textImage(['Canción de otoño en año']), 'spa');
    expect(text).toMatch(/Canción de otoño en año/);
  }, 60000);

  it('an unknown language is a settings error', async () => {
    await expect(ocr.recognize(textImage(['x']), 'xx')).rejects.toMatchObject({
      code: 'invalid-settings',
    });
  });
});
