import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { createCanvas } from 'canvas';
import { canMerge, isPageRangeSyntax, parsePageRange } from '@/lib/pdf-options';
import { editPdf, imageToPdf, mergePdf } from '@/lib/pdf-tools';
import { ConversionError } from '@/lib/errors';
import { DEFAULT_SETTINGS } from '@/lib/types';

// Real PDFium for "compress", loaded from bytes as in pdf-converters.test.ts.
vi.mock('@hyzyla/pdfium', async () => {
  const pdfium = (await import('@hyzyla/pdfium/dist/index.cjs')).default;
  const wasm = readFileSync(join(process.cwd(), 'public', 'wasm', 'pdfium.wasm'));
  const bytes = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
  return { PDFiumLibrary: { init: () => pdfium.PDFiumLibrary.init({ wasmBinary: bytes }) } };
});
// mozjpeg's wasm doesn't load under jsdom; node-canvas writes a real JPEG instead.
vi.mock('@jsquash/jpeg/encode', () => ({
  init: vi.fn(async () => {}),
  default: vi.fn(async (img: ImageData, { quality }: { quality: number }) => {
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    const data = ctx.createImageData(img.width, img.height);
    data.data.set(img.data);
    ctx.putImageData(data, 0, 0);
    return canvas.toBuffer('image/jpeg', { quality: quality / 100 });
  }),
}));

/** A PDF whose page n is (100 + n) points wide, so pages can be told apart. */
async function numberedPdf(count: number, name = 'doc.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([100 + i, 200]);
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(0.1, 0.3, 0.9) });
  }
  return new File([await doc.save()], name, { type: 'application/pdf' });
}

async function widths(blob: Blob): Promise<number[]> {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

function png(width: number, height: number, name = 'img.png'): File {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff4d00';
  ctx.fillRect(0, 0, width, height);
  return new File([canvas.toBuffer('image/png')], name, { type: 'image/png' });
}

const settings = (patch: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...patch });

describe('parsePageRange', () => {
  it('lists pages in the order written, ranges both ways, open ends', () => {
    expect(parsePageRange('', 4)).toEqual([0, 1, 2, 3]);
    expect(parsePageRange('1-3, 5', 6)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('3,1,2', 3)).toEqual([2, 0, 1]);
    expect(parsePageRange('4-2', 5)).toEqual([3, 2, 1]);
    expect(parsePageRange('5-', 6)).toEqual([4, 5]);
    expect(parsePageRange('-2', 6)).toEqual([0, 1]);
    expect(parsePageRange('1,1', 2)).toEqual([0, 0]);
  });

  it('rejects pages that do not exist and text that is not a range', () => {
    expect(() => parsePageRange('9', 5)).toThrow(/Page 9 is out of range: this PDF has 5 pages/);
    expect(() => parsePageRange('0', 5)).toThrow(ConversionError);
    expect(() => parsePageRange('two', 5)).toThrow(/not a page or a range/);
    try {
      parsePageRange('1-7', 3);
    } catch (err) {
      expect((err as ConversionError).code).toBe('invalid-settings');
    }
  });

  it('isPageRangeSyntax validates before the page count is known', () => {
    for (const ok of ['', '1', '1-3, 5', '8-', '-2', '3,1,2'])
      expect(isPageRangeSyntax(ok), ok).toBe(true);
    for (const bad of ['a', '1-2-3', ',', '-', '1;2'])
      expect(isPageRangeSyntax(bad), bad).toBe(false);
  });
});

describe('editPdf', () => {
  it('picks and reorders pages', async () => {
    const out = await editPdf(
      await numberedPdf(5),
      'pdf',
      'pdf',
      settings({ pdfPageRange: '3,1,5-4' }),
    );
    expect(out.type).toBe('application/pdf');
    expect(await widths(out)).toEqual([102, 100, 104, 103]);
  });

  it('adds the rotation to each page', async () => {
    const out = await editPdf(await numberedPdf(2), 'pdf', 'pdf', settings({ pdfRotate: 90 }));
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90]);
    const twice = await editPdf(
      new File([out], 'r.pdf'),
      'pdf',
      'pdf',
      settings({ pdfRotate: 270 }),
    );
    const doc2 = await PDFDocument.load(await twice.arrayBuffer());
    expect(doc2.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0]);
  });

  it('splits into one PDF per page, named by original page number', async () => {
    const out = await editPdf(
      await numberedPdf(4, 'report.pdf'),
      'pdf',
      'pdf',
      settings({ pdfSplit: true, pdfPageRange: '2-3' }),
    );
    expect(out.type).toBe('application/zip');
    const zip = await JSZip.loadAsync(await out.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['report-page-2.pdf', 'report-page-3.pdf']);
    expect(
      await widths(new Blob([await zip.file('report-page-3.pdf')!.async('uint8array')])),
    ).toEqual([102]);
  });

  it('a page range beyond the document is a settings error, not a damaged file', async () => {
    await expect(
      editPdf(await numberedPdf(2), 'pdf', 'pdf', settings({ pdfPageRange: '1-4' })),
    ).rejects.toMatchObject({ code: 'invalid-settings' });
  });

  it('a file that is not a PDF is corrupt input', async () => {
    await expect(
      editPdf(new File(['hello'], 'x.pdf'), 'pdf', 'pdf', DEFAULT_SETTINGS),
    ).rejects.toMatchObject({
      code: 'corrupt-input',
    });
  });

  it('compress re-renders pages as JPEG, keeping page count and size', async () => {
    // A page that is one big photo-like image: the case compression is for.
    const doc = await PDFDocument.create();
    const canvas = createCanvas(1200, 1600);
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 1600; y += 4)
      for (let x = 0; x < 1200; x += 4) {
        ctx.fillStyle = `rgb(${(x * 7) % 256},${(y * 3) % 256},${(x + y) % 256})`;
        ctx.fillRect(x, y, 4, 4);
      }
    const image = await doc.embedPng(new Uint8Array(canvas.toBuffer('image/png')));
    doc.addPage([300, 400]).drawImage(image, { x: 0, y: 0, width: 300, height: 400 });
    const file = new File([await doc.save()], 'scan.pdf');

    const out = await editPdf(file, 'pdf', 'pdf', settings({ pdfCompress: 'strong' }));
    expect(out.size).toBeLessThan(file.size);
    const result = await PDFDocument.load(await out.arrayBuffer());
    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  }, 60000);

  it('compress never makes a file bigger: text-only pages stay as they are', async () => {
    const file = await numberedPdf(2);
    const plain = await editPdf(file, 'pdf', 'pdf', DEFAULT_SETTINGS);
    const compressed = await editPdf(file, 'pdf', 'pdf', settings({ pdfCompress: 'medium' }));
    expect(compressed.size).toBe(plain.size);
  }, 60000);
});

describe('imageToPdf', () => {
  it('fits the image onto A4, landscape for a landscape image', async () => {
    const out = await imageToPdf(png(1600, 900), 'png', 'pdf', DEFAULT_SETTINGS);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
  });

  it('"fit" makes the page the image, at 96 dpi', async () => {
    const out = await imageToPdf(png(400, 200), 'png', 'pdf', settings({ pdfPageSize: 'fit' }));
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 150 });
  });

  it('embeds a JPEG as it is, without re-encoding', async () => {
    const canvas = createCanvas(64, 64);
    canvas.getContext('2d').fillRect(0, 0, 64, 64);
    const jpeg = canvas.toBuffer('image/jpeg');
    const out = await imageToPdf(
      new File([jpeg], 'p.jpg'),
      'jpg',
      'pdf',
      settings({ pdfPageSize: 'letter' }),
    );
    const bytes = new Uint8Array(await out.arrayBuffer());
    // The original JPEG bytes appear verbatim inside the PDF.
    const haystack = Buffer.from(bytes);
    expect(haystack.includes(jpeg.subarray(0, 64))).toBe(true);
  });
});

describe('imageToPdf and metadata', () => {
  it("a photo's EXIF (location included) does not ride along into the PDF", async () => {
    const { buildExif, insertExif } = await import('@/lib/image-metadata');
    const canvas = createCanvas(32, 32);
    canvas.getContext('2d').fillRect(0, 0, 32, 32);
    const tiff = buildExif(
      { make: 'Apple', model: 'iPhone', gps: { latitude: 48.85, longitude: 2.29 } },
      { keepGps: true },
    );
    const photo = insertExif(new Uint8Array(canvas.toBuffer('image/jpeg')), 'jpg', tiff);
    const out = await imageToPdf(new File([photo], 'geo.jpg'), 'jpg', 'pdf', DEFAULT_SETTINGS);
    const bytes = Buffer.from(await out.arrayBuffer());
    expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
    expect(bytes.includes(Buffer.from('iPhone'))).toBe(false);
  });
});

describe('imageToPdf errors', () => {
  it('an unreadable image is corrupt input', async () => {
    await expect(
      imageToPdf(new File(['nope'], 'x.png'), 'png', 'pdf', DEFAULT_SETTINGS),
    ).rejects.toMatchObject({ code: 'corrupt-input' });
  });
});

describe('mergePdf', () => {
  it('joins PDFs and images in order', async () => {
    const files = [await numberedPdf(2, 'a.pdf'), png(300, 300), await numberedPdf(1, 'b.pdf')];
    const progress: number[] = [];
    const out = await mergePdf(files, { pdfPageSize: 'fit' }, (p) => progress.push(p));
    expect(await widths(out)).toEqual([100, 101, 225, 100]);
    expect(progress.at(-1)).toBe(95);
  });

  it('names the file that broke the merge', async () => {
    const files = [await numberedPdf(1), new File(['not a png'], 'broken.png')];
    await expect(mergePdf(files)).rejects.toMatchObject({
      code: 'corrupt-input',
      message: expect.stringMatching(/^broken\.png: /),
    });
  });

  it('knows what it can take', () => {
    expect(['pdf', 'png', 'jpg', 'heic', 'jxl'].every(canMerge)).toBe(true);
    expect(['mp4', 'csv', 'docx'].some(canMerge)).toBe(false);
  });
});
