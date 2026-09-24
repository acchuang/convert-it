import { describe, it, expect, vi } from 'vitest';
import { pdfToImage, pdfToText, pdfToHtml } from '@/lib/pdf-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

// jsdom can't fetch the jSquash/PDFium wasm at runtime; stub the encode + pdfium
// surfaces so the tests exercise the PDF input-converter orchestration only.
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
vi.mock('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js', () => ({
  default: vi.fn(() => Promise.resolve()),
  optimise: vi.fn((data: Uint8Array) => data),
}));

// Per-test page list the mocked loadDocument should expose.
let currentPages: ReturnType<typeof fakePage>[] = [];

function fakePage(text: string, width = 4, height = 4) {
  // RGBA, as the real renderer returns it (see pdfRenderToImageData).
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; // R
    data[i + 1] = 0; // G
    data[i + 2] = 0; // B
    data[i + 3] = 255; // A
  }
  return {
    number: 0,
    getText: () => text,
    render: vi.fn(async (opts?: { scale?: number }) => ({ width, height, data })),
  };
}

vi.mock('@hyzyla/pdfium', () => ({
  PDFiumLibrary: {
    init: vi.fn(() =>
      Promise.resolve({
        loadDocument: vi.fn(async () => ({
          getPageCount: () => currentPages.length,
          getPage: (i: number) => currentPages[i],
          pages: function* () {
            for (const p of currentPages) yield p;
          },
          destroy: vi.fn(),
        })),
      }),
    ),
  },
}));

describe('pdfToImage (page 1)', () => {
  it('renders page 1 to PNG', async () => {
    currentPages = [fakePage('page one text', 4, 4), fakePage('page two', 2, 2)];
    const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', {
      type: 'application/pdf',
    });
    const blob = await pdfToImage(file, 'pdf', 'png', { quality: 0.9 } as any);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('renders page 1 to JPEG', async () => {
    currentPages = [fakePage('hello')];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    const blob = await pdfToImage(file, 'pdf', 'jpg', { quality: 0.5 } as any);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('throws when the PDF has no pages', async () => {
    currentPages = [];
    const file = new File([new Uint8Array([1])], 'empty.pdf', { type: 'application/pdf' });
    await expect(pdfToImage(file, 'pdf', 'png')).rejects.toThrow('PDF has no pages');
  });

  it('passes pdfScale through to page.render', async () => {
    currentPages = [fakePage('scaled')];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    await pdfToImage(file, 'pdf', 'png', { quality: 0.9, pdfScale: 2 } as any);
    expect(currentPages[0].render).toHaveBeenCalledWith({ scale: 2 });
  });
});

describe('pdfToImage (all pages → zip)', () => {
  it('zips every page as <base>-page-<n>.<ext>', async () => {
    currentPages = [fakePage('one'), fakePage('two')];
    const file = new File([new Uint8Array([1])], 'report.pdf', { type: 'application/pdf' });
    const progress: number[] = [];
    const blob = await pdfToImage(file, 'pdf', 'png', { pdfAllPages: true } as any, (pct) =>
      progress.push(pct),
    );
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
    // Both pages rendered, each at the default scale of 1.
    expect(currentPages[0].render).toHaveBeenCalledWith({ scale: 1 });
    expect(currentPages[1].render).toHaveBeenCalledWith({ scale: 1 });
    // Per-page progress reported.
    expect(progress).toEqual([50, 100]);

    // The zip contains one entry per page, named report-page-<n>.png.
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).sort()).toEqual(['report-page-1.png', 'report-page-2.png']);
  });
});

describe('pdfToText (all pages)', () => {
  it('concatenates text from every page', async () => {
    currentPages = [fakePage('alpha'), fakePage('beta'), fakePage('gamma')];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    const blob = await pdfToText(file, 'pdf', 'txt');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    const text = await blob.text();
    expect(text).toBe('alpha\n\nbeta\n\ngamma');
  });
});

describe('pdfToHtml (all pages)', () => {
  it('wraps each page text in an HTML document', async () => {
    currentPages = [fakePage('alpha'), fakePage('<b>bold</b>')];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    const blob = await pdfToHtml(file, 'pdf', 'html');
    expect(blob.type).toBe('text/html;charset=utf-8');
    const html = await blob.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<pre>alpha</pre>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});

describe('pdfToImage applies the image toolbox', () => {
  it('resizes the rendered page before encoding', async () => {
    const { default: encodePng } = await import('@jsquash/png/encode');
    vi.mocked(encodePng).mockClear();
    currentPages = [fakePage('big', 8, 4)];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    await pdfToImage(file, 'pdf', 'png', { ...DEFAULT_SETTINGS, imageResizePercent: 50 });
    const encoded = vi.mocked(encodePng).mock.calls[0][0] as ImageData;
    expect([encoded.width, encoded.height]).toEqual([4, 2]);
  });

  it('applies to every page of an all-pages zip', async () => {
    const { default: encodePng } = await import('@jsquash/png/encode');
    vi.mocked(encodePng).mockClear();
    currentPages = [fakePage('a', 8, 8), fakePage('b', 8, 8)];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    await pdfToImage(file, 'pdf', 'png', {
      ...DEFAULT_SETTINGS,
      pdfAllPages: true,
      imageCropAspect: '16:9',
    });
    const sizes = vi
      .mocked(encodePng)
      .mock.calls.map(([d]) => [(d as ImageData).width, (d as ImageData).height]);
    expect(sizes).toEqual([
      [8, 5],
      [8, 5],
    ]);
  });
});

describe('PDF text extraction progress', () => {
  it('reports progress per page for text and HTML output', async () => {
    currentPages = [fakePage('a'), fakePage('b'), fakePage('c'), fakePage('d')];
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    for (const convert of [pdfToText, pdfToHtml]) {
      const progress: number[] = [];
      await convert(file, 'pdf', 'txt', undefined, (pct) => progress.push(pct));
      expect(progress).toEqual([25, 50, 75, 100]);
    }
  });
});
