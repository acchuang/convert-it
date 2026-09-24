import { describe, it, expect } from 'vitest';
import { escapeXml, xmlName, rowsToXml, rowsToHtmlTable } from '@/lib/markup';

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    );
  });
});

describe('xmlName', () => {
  it.each([
    ['name', 'name'],
    ['First Name', 'First_Name'],
    ['2024', '_2024'],
    ['a/b', 'a_b'],
    ['-x', '_-x'],
    ['xmlThing', '_xmlThing'],
    ['', 'field'],
    ['   ', 'field'],
    ['größe', 'größe'],
    ['名前', '名前'],
    ['a×b÷c', 'a_b_c'],
    ['price 💰', 'price__'],
  ])('%j → %j', (raw, expected) => {
    expect(xmlName(raw)).toBe(expected);
  });
});

describe('rowsToXml', () => {
  it('produces well-formed XML from hostile keys and values', () => {
    const xml = rowsToXml(
      [{ 'First Name': 'AT&T', '2024': '<b>bold</b>', 'a/b': `"quoted" 'single'` }],
      'my root',
    );
    const doc = parseXml(xml);
    expect(doc.documentElement.tagName).toBe('my_root');
    expect(doc.getElementsByTagName('First_Name')[0].textContent).toBe('AT&T');
    expect(doc.getElementsByTagName('_2024')[0].textContent).toBe('<b>bold</b>');
  });

  it('nests objects and repeats arrays instead of printing [object Object]', () => {
    const xml = rowsToXml([{ user: { name: 'Ann', tags: ['a', 'b'] }, empty: {} }], 'root');
    expect(xml).not.toContain('[object Object]');
    const doc = parseXml(xml);
    expect(doc.querySelector('user > name')?.textContent).toBe('Ann');
    expect(doc.querySelectorAll('user > tags')).toHaveLength(2);
  });

  it('handles null and undefined as empty elements', () => {
    const doc = parseXml(rowsToXml([{ a: null, b: undefined }], 'root'));
    expect(doc.getElementsByTagName('a')[0].textContent).toBe('');
  });
});

describe('rowsToHtmlTable', () => {
  it('escapes headers and cells so markup in data stays text', () => {
    const html = rowsToHtmlTable(['<h>'], [{ '<h>': '<script>alert(1)</script>' }]);
    expect(html).not.toContain('<script>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('th')?.textContent).toBe('<h>');
    expect(doc.querySelector('td')?.textContent).toBe('<script>alert(1)</script>');
    expect(doc.querySelector('meta[charset]')).not.toBeNull();
  });
});
