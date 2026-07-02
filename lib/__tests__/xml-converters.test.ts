import { describe, it, expect } from 'vitest';
import { xmlToJson, xmlToTxt, jsonToXml, xmlToCsv, xmlToYaml, xmlToTsv } from '@/lib/xml-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

const XML = '<root><item><name>Alice</name><age>30</age></item></root>';
const ROW_XML = '<root><row><name>Alice</name><age>30</age></row><row><name>Bob</name><age>25</age></row></root>';

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
    const blob = await jsonToXml(file, 'json', 'xml', { ...DEFAULT_SETTINGS, xmlRootElement: 'person' });
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

  it('throws when no <row> elements are found', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    await expect(xmlToCsv(file, 'xml', 'csv', DEFAULT_SETTINGS)).rejects.toThrow('No <row> elements found in XML');
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

  it('produces empty array output when no <row> elements exist', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    const blob = await xmlToYaml(file, 'xml', 'yaml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text.trim()).toBe('[]');
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

  it('throws when no <row> elements are found', async () => {
    const file = new File([XML], 'test.xml', { type: 'application/xml' });
    await expect(xmlToTsv(file, 'xml', 'tsv', DEFAULT_SETTINGS)).rejects.toThrow('No <row> elements found in XML');
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
