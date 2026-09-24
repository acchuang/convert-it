import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pdfium from '@hyzyla/pdfium/dist/index.cjs';
import {
  txtToPdf,
  mdToPdf,
  htmlToPdf,
  jsonToPdf,
  pdfRenderToImageData,
} from '@/lib/pdf-converters';
import { setFontLoader } from '@/lib/pdf-layout';
import { DEFAULT_SETTINGS } from '@/lib/types';

const root = join(__dirname, '..', '..');
const fetchedFonts: string[] = [];

// The app fetches /fonts/pdf/*; tests read the same files from disk and record
// which ones a conversion asked for. Installing the loader also empties the
// font cache, so a test that counts fetches starts from nothing.
function freshFonts(): void {
  fetchedFonts.length = 0;
  setFontLoader(async (file) => {
    fetchedFonts.push(file);
    const buf = readFileSync(join(root, 'public', 'fonts', 'pdf', file));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });
}

beforeAll(freshFonts);

// Text as a PDF reader extracts it, through real PDFium (the engine the app
// uses for PDF input). This checks what copy/paste and search will see,
// including CJK through the embedded font's ToUnicode map.
type PdfiumLib = Awaited<ReturnType<typeof pdfium.PDFiumLibrary.init>>;
let library: PdfiumLib | null = null;
async function pdfText(blob: Blob): Promise<string[]> {
  if (!library) {
    const wasm = readFileSync(join(root, 'public', 'wasm', 'pdfium.wasm'));
    library = await pdfium.PDFiumLibrary.init({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    });
  }
  const doc = await library.loadDocument(new Uint8Array(await blob.arrayBuffer()));
  try {
    const pages: string[] = [];
    for (let i = 0; i < doc.getPageCount(); i++) pages.push(doc.getPage(i).getText());
    return pages
      .join('\n')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter(Boolean);
  } finally {
    doc.destroy();
  }
}

async function pdfBytes(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}

async function expectValidPdf(blob: Blob) {
  expect(blob.size).toBeGreaterThan(0);
  expect(blob.type).toContain('pdf');
  const buffer = await blob.arrayBuffer();
  const header = new TextDecoder().decode(buffer.slice(0, 5));
  expect(header).toBe('%PDF-');
}

describe('txtToPdf', () => {
  it('produces a valid PDF blob from plain text', async () => {
    const file = new File(['Hello world'], 'test.txt', { type: 'text/plain' });
    const blob = await txtToPdf(file, 'txt', 'pdf', DEFAULT_SETTINGS);
    await expectValidPdf(blob);
  });
});

describe('mdToPdf', () => {
  it('produces a valid PDF blob from markdown', async () => {
    const file = new File(['# Title\n\nParagraph text'], 'doc.md', { type: 'text/markdown' });
    const blob = await mdToPdf(file, 'md', 'pdf', DEFAULT_SETTINGS);
    await expectValidPdf(blob);
  });
});

describe('htmlToPdf', () => {
  it('produces a valid PDF blob from HTML', async () => {
    const file = new File(['<p>Hello</p>'], 'page.html', { type: 'text/html' });
    const blob = await htmlToPdf(file, 'html', 'pdf', DEFAULT_SETTINGS);
    await expectValidPdf(blob);
  });
});

describe('jsonToPdf', () => {
  it('produces a valid PDF blob from JSON', async () => {
    const json = JSON.stringify({ name: 'Alice', age: 30 });
    const file = new File([json], 'data.json', { type: 'application/json' });
    const blob = await jsonToPdf(file, 'json', 'pdf', DEFAULT_SETTINGS);
    await expectValidPdf(blob);
  });
});

describe('PDF output keeps line structure', () => {
  // PDFium's extractor collapses runs of spaces, so indentation is checked on
  // the drawn strings (WinAnsi text is stored readable in the content stream).
  async function drawn(blob: Blob): Promise<string[]> {
    const raw = await pdfBytes(blob);
    return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  }

  it('txtToPdf keeps each line, its indentation and blank lines', async () => {
    const file = new File(['first line\n    indented (x)\n\nfourth'], 'a.txt');
    const blob = await txtToPdf(file, 'txt', 'pdf');
    expect(await drawn(blob)).toEqual(['first line', '    indented (x)', 'fourth']);
    expect(await pdfText(blob)).toEqual(['first line', ' indented (x)', 'fourth']);
  });

  it('jsonToPdf keeps the pretty-printed layout', async () => {
    const file = new File(['{"name":"Alice","tags":["a"]}'], 'a.json');
    expect(await drawn(await jsonToPdf(file, 'json', 'pdf'))).toEqual([
      '{',
      '  "name": "Alice",',
      '  "tags": [',
      '    "a"',
      '  ]',
      '}',
    ]);
  });

  it('mdToPdf keeps code-block indentation', async () => {
    const md = '```\nfn {\n  return 1;\n    deeper\n}\n```';
    expect(await drawn(await mdToPdf(new File([md], 'a.md'), 'md', 'pdf'))).toEqual([
      'fn {',
      '  return 1;',
      '    deeper',
      '}',
    ]);
  });

  it('htmlToPdf keeps blocks and leaves script and style text out', async () => {
    const file = new File(
      ['<style>p{}</style><script>alert(1)</script><p>one</p><p>two</p>'],
      'a.html',
    );
    expect(await pdfText(await htmlToPdf(file, 'html', 'pdf'))).toEqual(['one', 'two']);
  });

  it('wraps long lines without losing words, and paginates', async () => {
    const words = Array.from({ length: 2000 }, (_, i) => `w${i}`);
    const blob = await txtToPdf(new File([words.join(' ')], 'a.txt'), 'txt', 'pdf');
    const lines = await pdfText(blob);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.join(' ').split(/\s+/)).toEqual(words);
    expect((await pdfBytes(blob)).match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
});

describe('Unicode PDF output', () => {
  it('uses the built-in fonts, and fetches nothing, when the text fits WinAnsi', async () => {
    freshFonts();
    const blob = await txtToPdf(new File(['Café – “quoted” • 10 €'], 'a.txt'), 'txt', 'pdf');
    expect(fetchedFonts).toEqual([]);
    expect(await pdfText(blob)).toEqual(['Café – “quoted” • 10 €']);
    expect(await pdfBytes(blob)).not.toMatch(/Noto/);
  });

  it('renders Greek, Cyrillic, Vietnamese, CJK and Hangul as real text', async () => {
    const lines = [
      'Ελληνικά κείμενο',
      'Русский текст',
      'Tiếng Việt có dấu',
      '中文简体，繁體中文',
      '日本語のテキスト、カタカナ',
      '한국어 텍스트',
    ];
    freshFonts();
    const blob = await txtToPdf(new File([lines.join('\n')], 'a.txt'), 'txt', 'pdf');
    expect(await pdfText(blob)).toEqual(lines);
    expect(new Set(fetchedFonts)).toEqual(
      new Set([
        'noto-sans-regular.ttf',
        'noto-sans-cjk-regular.ttf',
        'noto-sans-hangul-regular.ttf',
      ]),
    );
    // Subsetting: a 5 MB CJK font must not ride along whole.
    expect(blob.size).toBeLessThan(400_000);
  });

  it('fetches only the fonts a document needs', async () => {
    freshFonts();
    await txtToPdf(new File(['Привет'], 'a.txt'), 'txt', 'pdf');
    expect(fetchedFonts).toEqual(['noto-sans-regular.ttf']);
  });

  it('wraps CJK between characters, losing none', async () => {
    const text = '吾輩は猫である。名前はまだ無い。'.repeat(40);
    const lines = await pdfText(await txtToPdf(new File([text], 'a.txt'), 'txt', 'pdf'));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join('')).toBe(text);
  });

  it('replaces characters no shipped font covers instead of failing', async () => {
    const blob = await txtToPdf(new File(['ok 😀 done'], 'a.txt'), 'txt', 'pdf');
    expect(await pdfText(blob)).toEqual(['ok ? done']);
  });
});

describe('Markdown → PDF styling', () => {
  const md = [
    '# Report',
    '',
    'Some **bold**, *italic* and `code` with a [link](https://example.com).',
    '',
    '- first',
    '- second',
    '  - nested',
    '',
    '1. one',
    '2. two',
    '',
    '> quoted text',
    '',
    '```',
    'const x = 1;',
    '```',
    '',
    '| Name | Qty |',
    '|------|-----|',
    '| apple | 3 |',
    '',
    '---',
    '',
    'Line<br>break &amp; entity',
  ].join('\n');

  it('keeps every piece of text in reading order', async () => {
    const lines = await pdfText(await mdToPdf(new File([md], 'a.md'), 'md', 'pdf'));
    expect(lines).toEqual([
      'Report',
      'Some bold, italic and code with a link.',
      '• first',
      '• second',
      '– nested',
      '1. one',
      '2. two',
      'quoted text',
      'const x = 1;',
      'Name Qty',
      'apple 3',
      'Line',
      'break & entity',
    ]);
  });

  it('sets headings and bold in a bold face, code in mono, and links as links', async () => {
    const bytes = await pdfBytes(await mdToPdf(new File([md], 'a.md'), 'md', 'pdf'));
    expect(bytes).toMatch(/Helvetica-Bold/);
    expect(bytes).toMatch(/Courier/);
    expect(bytes).toMatch(/\/URI \(https:\/\/example\.com\)/);
  });

  it('styles non-Latin Markdown with the Noto faces', async () => {
    freshFonts();
    const blob = await mdToPdf(
      new File(['# Заголовок\n\n**жирный** и `код`'], 'a.md'),
      'md',
      'pdf',
    );
    expect(await pdfText(blob)).toEqual(['Заголовок', 'жирный и код']);
    expect(new Set(fetchedFonts)).toEqual(
      new Set(['noto-sans-regular.ttf', 'noto-sans-bold.ttf', 'noto-sans-mono-regular.ttf']),
    );
  });
});

describe('PDF → image colours (real PDFium)', () => {
  it('keeps red and blue where they are', async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: [100, 100] });
    pdf.setFillColor(0, 0, 255);
    pdf.rect(0, 0, 50, 100, 'F'); // left half blue
    pdf.setFillColor(255, 0, 0);
    pdf.rect(50, 0, 50, 100, 'F'); // right half red
    await pdfText(new Blob([pdf.output('arraybuffer')])); // initialises the library
    const doc = await library!.loadDocument(new Uint8Array(pdf.output('arraybuffer')));
    try {
      const image = pdfRenderToImageData(await doc.getPage(0).render({ scale: 1 }));
      const px = (x: number, y: number) => {
        const i = (y * image.width + x) * 4;
        return [...image.data.slice(i, i + 3)];
      };
      expect(px(25, 50)).toEqual([0, 0, 255]);
      expect(px(75, 50)).toEqual([255, 0, 0]);
    } finally {
      doc.destroy();
    }
  });
});
