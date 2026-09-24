import { describe, it, expect } from 'vitest';
import { txtToPdf, mdToPdf, htmlToPdf, jsonToPdf } from '@/lib/pdf-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

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

// jsPDF writes uncompressed content streams, one `(text) Tj` per drawn line,
// with the standard fonts' WinAnsi bytes (so `•` is 0x95, not UTF-8).
async function pdfLines(blob: Blob): Promise<string[]> {
  const raw = new TextDecoder('windows-1252').decode(await blob.arrayBuffer());
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

describe('PDF output keeps line structure', () => {
  it('txtToPdf draws one line per source line', async () => {
    const file = new File(['first line\nsecond (line)\n\nfourth'], 'a.txt');
    expect(await pdfLines(await txtToPdf(file, 'txt', 'pdf'))).toEqual([
      'first line',
      'second (line)',
      'fourth',
    ]);
  });

  it('jsonToPdf keeps the pretty-printed layout', async () => {
    const file = new File(['{"name":"Alice","age":30}'], 'a.json');
    expect(await pdfLines(await jsonToPdf(file, 'json', 'pdf'))).toEqual([
      '{',
      '  "name": "Alice",',
      '  "age": 30',
      '}',
    ]);
  });

  it('mdToPdf separates blocks', async () => {
    const file = new File(['# Title\n\nParagraph\n\n- one\n- two'], 'a.md');
    const lines = await pdfLines(await mdToPdf(file, 'md', 'pdf'));
    expect(lines).toEqual(['Title', 'Paragraph', '• one', '• two']);
  });

  it('htmlToPdf leaves script and style text out', async () => {
    const file = new File(
      ['<style>p{}</style><script>alert(1)</script><p>one</p><p>two</p>'],
      'a.html',
    );
    expect(await pdfLines(await htmlToPdf(file, 'html', 'pdf'))).toEqual(['one', 'two']);
  });

  it('wraps long lines and paginates', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i} `.repeat(20)).join('\n');
    const blob = await txtToPdf(new File([long], 'a.txt'), 'txt', 'pdf');
    const lines = await pdfLines(blob);
    expect(lines.length).toBeGreaterThan(200);
    expect((await blob.text()).match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
});
