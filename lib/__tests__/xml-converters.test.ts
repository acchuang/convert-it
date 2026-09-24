import { describe, it, expect } from 'vitest';
import {
  xmlToJson,
  xmlToTxt,
  jsonToXml,
  xmlToCsv,
  xmlToYaml,
  xmlToTsv,
} from '@/lib/xml-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

const XML = '<root><item><name>Alice</name><age>30</age></item></root>';
const ROW_XML =
  '<root><row><name>Alice</name><age>30</age></row><row><name>Bob</name><age>25</age></row></root>';

describe('xmlToJson', () => {
  it('parses simple XML into a JSON object', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToJson(file, 'xml', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    const data = JSON.parse(text);
    expect(data).toEqual({ root: { item: { name: 'Alice', age: 30 } } });
  });

  it('respects jsonIndent setting of 0 (minified)', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToJson(file, 'xml', 'json', { ...DEFAULT_SETTINGS, jsonIndent: 0 });
    const text = await blob.text();
    expect(text).not.toContain('\n');
  });
});

describe('jsonToXml', () => {
  it('wraps JSON with default root element "root"', async () => {
    const json = JSON.stringify({ name: 'Alice', age: 30 });
    const file = new File([json], 'test.json', { type: 'application/json' });
    const blob = await jsonToXml(file, 'json', 'xml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('<root>');
    expect(text).toContain('</root>');
    expect(text).toContain('<name>Alice</name>');
    expect(text).toContain('<age>30</age>');
  });

  it('respects custom xmlRootElement setting', async () => {
    const json = JSON.stringify({ name: 'Alice' });
    const file = new File([json], 'test.json', { type: 'application/json' });
    const blob = await jsonToXml(file, 'json', 'xml', {
      ...DEFAULT_SETTINGS,
      xmlRootElement: 'person',
    });
    const text = await blob.text();
    expect(text).toContain('<person>');
    expect(text).toContain('</person>');
  });
});

describe('xml -> json -> xml round trip', () => {
  it('preserves key data', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const jsonBlob = await xmlToJson(file, 'xml', 'json', DEFAULT_SETTINGS);
    const jsonText = await jsonBlob.text();

    const jsonFile = new File([jsonText], 'test.json', { type: 'application/json' });
    const xmlBlob = await jsonToXml(jsonFile, 'json', 'xml', DEFAULT_SETTINGS);
    const xmlText = await xmlBlob.text();

    expect(xmlText).toContain('<name>Alice</name>');
    expect(xmlText).toContain('<age>30</age>');
  });
});

describe('xmlToTxt', () => {
  it('extracts plain text content from XML', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToTxt(file);
    const text = await blob.text();
    expect(text).toContain('Alice');
    expect(text).toContain('30');
    expect(text).not.toContain('<name>');
  });
});

describe('xmlToCsv', () => {
  it('converts <row> elements into CSV', async () => {
    const file = new File([ROW_XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToCsv(file, 'xml', 'csv', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('respects custom csvDelimiter setting', async () => {
    const file = new File([ROW_XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToCsv(file, 'xml', 'csv', { ...DEFAULT_SETTINGS, csvDelimiter: ';' });
    const text = await blob.text();
    expect(text).toContain('name;age');
  });

  // Any element name works, not just <row>; a single record is a one-row table.
  it('treats a single non-<row> record as one row', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToCsv(file, 'xml', 'csv', DEFAULT_SETTINGS);
    expect(await blob.text()).toBe('name,age\r\nAlice,30');
  });
});

describe('xmlToYaml', () => {
  it('converts <row> elements into YAML', async () => {
    const file = new File([ROW_XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToYaml(file, 'xml', 'yaml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name: Alice');
    expect(text).toContain('age: "30"');
  });

  it('converts a single non-<row> record', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToYaml(file, 'xml', 'yaml', DEFAULT_SETTINGS);
    expect((await blob.text()).trim()).toBe('- name: Alice\n  age: "30"');
  });
});

describe('xmlToTsv', () => {
  it('converts <row> elements into TSV', async () => {
    const file = new File([ROW_XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToTsv(file, 'xml', 'tsv', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name\tage');
    expect(text).toContain('Alice');
  });

  it('rejects malformed XML with the line number', async () => {
    const file = new File(['<root>\n<a>1</b>\n</root>'], 'bad.xml', { type: 'application/xml' });
    await expect(xmlToTsv(file, 'xml', 'tsv', DEFAULT_SETTINGS)).rejects.toThrow(
      /Invalid XML \(line 2\)/,
    );
  });
});

describe('special XML characters', () => {
  it('escapes & < > when converting JSON to XML', async () => {
    const json = JSON.stringify({ text: 'Tom & Jerry <3' });
    const file = new File([json], 'test.json', { type: 'application/json' });
    const blob = await jsonToXml(file, 'json', 'xml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('&amp;');
    expect(text).not.toContain('Tom & Jerry');
  });

  it('unescapes entities when converting XML to JSON', async () => {
    const xml = '<root><text>Tom &amp; Jerry</text></root>';
    const file = new File([xml], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToJson(file, 'xml', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    const data = JSON.parse(text);
    expect(data.root.text).toBe('Tom & Jerry');
  });
});

describe('real-world XML → tabular', () => {
  const csv = async (xml: string) =>
    (await xmlToCsv(new File([xml], 'a.xml'), 'xml', 'csv', DEFAULT_SETTINGS)).text();

  it('finds records under a header block and keeps attributes', async () => {
    const xml = `<?xml version="1.0"?>
      <catalog>
        <meta><generated>2026-01-01</generated><source>shop</source></meta>
        <books>
          <book id="1" lang="en"><title>Dune</title><price currency="USD">9.99</price></book>
          <book id="2"><title>Solaris &amp; more</title><price currency="EUR">7.50</price></book>
          <book id="3"><title>Ubik</title></book>
        </books>
      </catalog>`;
    expect(await csv(xml)).toBe(
      [
        '@id,@lang,title,price.@currency,price',
        '1,en,Dune,USD,9.99',
        '2,,Solaris & more,EUR,7.50',
        '3,,Ubik,,',
      ].join('\r\n'),
    );
  });

  it('flattens nested elements to dotted columns and joins repeated children', async () => {
    const xml = `<people>
      <person><name>Ann</name><address><city>Oslo</city><zip>0150</zip></address><tag>a</tag><tag>b</tag></person>
      <person><name>Bo</name><address><city>Rome</city></address></person>
    </people>`;
    expect(await csv(xml)).toBe(
      ['name,address.city,address.zip,tag', 'Ann,Oslo,0150,a; b', 'Bo,Rome,,'].join('\r\n'),
    );
  });

  it('picks the largest repeated element (an RSS feed)', async () => {
    const xml = `<rss><channel><title>Feed</title><link>x</link><link>y</link>
      <item><title>One</title></item><item><title>Two</title></item><item><title>Three</title></item>
    </channel></rss>`;
    expect(await csv(xml)).toBe(['title', 'One', 'Two', 'Three'].join('\r\n'));
  });

  it('keeps leading zeros and whitespace-only records as text', async () => {
    const xml = '<r><x><id>007</id></x><x><id>010</id></x></r>';
    expect(await csv(xml)).toBe(['id', '007', '010'].join('\r\n'));
  });

  it('rejects an empty document', async () => {
    await expect(csv('<root/>')).rejects.toThrow(/No records found/);
  });
});
