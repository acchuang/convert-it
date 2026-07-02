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
