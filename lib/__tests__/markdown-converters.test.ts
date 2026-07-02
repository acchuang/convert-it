import { describe, it, expect } from 'vitest';
import { mdToHtml, htmlToMd, htmlToTxt, txtToHtml, txtToMd, jsonToTxt, jsonToMd } from '@/lib/markdown-converters';

describe('mdToHtml', () => {
  it('converts a heading and paragraph to HTML', async () => {
    const file = new File(['# Title\n\nSome paragraph text.'], 'doc.md', { type: 'text/markdown' });
    const blob = await mdToHtml(file, 'md', 'html');
    const html = await blob.text();
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<p>Some paragraph text.</p>');
    expect(blob.type).toBe('text/html');
  });
});

describe('htmlToMd', () => {
  it('converts headings and paragraphs back to markdown', async () => {
    const file = new File(['<h1>Title</h1><p>Some paragraph text.</p>'], 'doc.html', { type: 'text/html' });
    const blob = await htmlToMd(file, 'html', 'md');
    const md = await blob.text();
    expect(md).toContain('# Title');
    expect(md).toContain('Some paragraph text.');
    expect(blob.type).toBe('text/markdown');
  });
});

describe('htmlToTxt', () => {
  it('strips tags and collapses excessive blank lines', async () => {
    const file = new File(['<h1>Title</h1><p>Body text</p>'], 'doc.html', { type: 'text/html' });
    const blob = await htmlToTxt(file, 'html', 'txt');
    const txt = await blob.text();
    expect(txt).toContain('Title');
    expect(txt).toContain('Body text');
    expect(txt).not.toContain('<h1>');
    expect(txt).not.toContain('<p>');
    expect(blob.type).toBe('text/plain');
  });
});

describe('txtToHtml', () => {
  it('wraps each line in a paragraph and escapes HTML-sensitive characters', async () => {
    const file = new File(['Hello <world> & "friends"'], 'doc.txt', { type: 'text/plain' });
    const blob = await txtToHtml(file, 'txt', 'html');
    const html = await blob.text();
    expect(html).toContain('<p>Hello &lt;world&gt; &amp; &quot;friends&quot;</p>');
    expect(blob.type).toBe('text/html');
  });

  it('produces one paragraph per line', async () => {
    const file = new File(['line one\nline two'], 'doc.txt', { type: 'text/plain' });
    const blob = await txtToHtml(file, 'txt', 'html');
    const html = await blob.text();
    expect(html).toContain('<p>line one</p>');
    expect(html).toContain('<p>line two</p>');
  });
});

describe('txtToMd', () => {
  it('passes text through unchanged with a markdown mime type', async () => {
    const file = new File(['Plain text content'], 'doc.txt', { type: 'text/plain' });
    const blob = await txtToMd(file, 'txt', 'md');
    const md = await blob.text();
    expect(md).toBe('Plain text content');
    expect(blob.type).toBe('text/markdown');
  });
});

describe('jsonToTxt', () => {
  it('pretty-prints JSON as text', async () => {
    const file = new File([JSON.stringify({ a: 1, b: 'two' })], 'data.json', { type: 'application/json' });
    const blob = await jsonToTxt(file, 'json', 'txt');
    const txt = await blob.text();
    expect(txt).toBe(JSON.stringify({ a: 1, b: 'two' }, null, 2));
    expect(blob.type).toBe('text/plain');
  });
});

describe('jsonToMd', () => {
  it('renders an array of objects as a markdown table', async () => {
    const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    const file = new File([JSON.stringify(data)], 'data.json', { type: 'application/json' });
    const blob = await jsonToMd(file, 'json', 'md');
    const md = await blob.text();
    expect(md).toContain('| name | age |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Alice | 30 |');
    expect(md).toContain('| Bob | 25 |');
  });

  it('wraps a single object in a one-row table', async () => {
    const data = { name: 'Alice', age: 30 };
    const file = new File([JSON.stringify(data)], 'data.json', { type: 'application/json' });
    const blob = await jsonToMd(file, 'json', 'md');
    const md = await blob.text();
    expect(md).toContain('| name | age |');
    expect(md).toContain('| Alice | 30 |');
  });

  it('returns an empty markdown blob for an empty array', async () => {
    const file = new File(['[]'], 'data.json', { type: 'application/json' });
    const blob = await jsonToMd(file, 'json', 'md');
    const md = await blob.text();
    expect(md).toBe('');
  });
});
