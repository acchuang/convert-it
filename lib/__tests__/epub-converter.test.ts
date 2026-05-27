import { describe, it, expect } from 'vitest';
import { txtToEpub, mdToEpub, htmlToEpub } from '@/lib/epub-converter';
import JSZip from 'jszip';

async function unzip(blob: Blob): Promise<JSZip> {
  const buffer = await blob.arrayBuffer();
  return JSZip.loadAsync(buffer);
}

describe('txtToEpub', () => {
  it('produces valid ePub ZIP structure', async () => {
    const file = new File(['Hello world'], 'test.txt', { type: 'text/plain' });
    const blob = await txtToEpub(file, 'txt', 'epub');
    const zip = await unzip(blob);

    const mimetype = await zip.file('mimetype')!.async('text');
    expect(mimetype).toBe('application/epub+zip');

    const container = await zip.file('META-INF/container.xml')!.async('text');
    expect(container).toContain('OEBPS/content.opf');

    const opf = await zip.file('OEBPS/content.opf')!.async('text');
    expect(opf).toContain('<dc:title>test</dc:title>');
    expect(opf).toContain('chapter.xhtml');

    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('Hello world');
  });
});

describe('mdToEpub', () => {
  it('converts markdown to XHTML body', async () => {
    const file = new File(['# Title\n\nParagraph'], 'doc.md', { type: 'text/markdown' });
    const blob = await mdToEpub(file, 'md', 'epub');
    const zip = await unzip(blob);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('<h1>Title</h1>');
    expect(chapter).toContain('<p>Paragraph</p>');
  });
});

describe('htmlToEpub', () => {
  it('wraps HTML as XHTML body', async () => {
    const file = new File(['<p>Hello</p>'], 'page.html', { type: 'text/html' });
    const blob = await htmlToEpub(file, 'html', 'epub');
    const zip = await unzip(blob);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('<p>Hello</p>');
  });
});
