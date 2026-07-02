import { describe, it, expect } from 'vitest';
import {
  csvToJson,
  csvToTsv,
  csvToXml,
  csvToHtml,
  csvToYaml,
  csvToTxt,
  tsvToCsv,
  tsvToJson,
  tsvToXml,
  tsvToHtml,
} from '@/lib/csv-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

const CSV = 'name,age\nAlice,30\nBob,25';

describe('csvToJson', () => {
  it('produces a JSON array of objects with correct keys/values', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToJson(file, 'csv', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    const data = JSON.parse(text);
    expect(data).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('respects jsonIndent setting of 0 (minified)', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToJson(file, 'csv', 'json', { ...DEFAULT_SETTINGS, jsonIndent: 0 });
    const text = await blob.text();
    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('does not crash on empty input', async () => {
    const file = new File([''], 'empty.csv', { type: 'text/csv' });
    const blob = await csvToJson(file, 'csv', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual([]);
  });

  it('handles a row with fewer columns than the header', async () => {
    const csv = 'name,age,city\nAlice,30,\nBob,25,NYC';
    const file = new File([csv], 'ragged.csv', { type: 'text/csv' });
    const blob = await csvToJson(file, 'csv', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    const data = JSON.parse(text);
    expect(data).toHaveLength(2);
    expect(data[1]).toEqual({ name: 'Bob', age: 25, city: 'NYC' });
  });
});

describe('csvToTsv / tsvToCsv round trip', () => {
  it('preserves data when converting csv -> tsv -> csv', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const tsvBlob = await csvToTsv(file);
    const tsvText = await tsvBlob.text();
    expect(tsvText).toBe('name\tage\nAlice\t30\nBob\t25');

    const tsvFile = new File([tsvText], 'test.tsv', { type: 'text/tab-separated-values' });
    const csvBlob = await tsvToCsv(tsvFile, 'tsv', 'csv', DEFAULT_SETTINGS);
    const csvText = await csvBlob.text();
    // Papa.unparse defaults to \r\n line endings
    expect(csvText).toBe(CSV.replace(/\n/g, '\r\n'));
  });

  it('tsvToCsv respects custom csvDelimiter setting', async () => {
    const tsv = 'name\tage\nAlice\t30\nBob\t25';
    const file = new File([tsv], 'test.tsv', { type: 'text/tab-separated-values' });
    const blob = await tsvToCsv(file, 'tsv', 'csv', { ...DEFAULT_SETTINGS, csvDelimiter: ';' });
    const text = await blob.text();
    expect(text).toBe('name;age\r\nAlice;30\r\nBob;25');
  });
});

describe('csvToXml', () => {
  it('wraps rows in a default root element', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToXml(file, 'csv', 'xml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('<root>');
    expect(text).toContain('<name>Alice</name>');
    expect(text).toContain('<age>30</age>');
  });

  it('respects custom xmlRootElement setting', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToXml(file, 'csv', 'xml', { ...DEFAULT_SETTINGS, xmlRootElement: 'people' });
    const text = await blob.text();
    expect(text).toContain('<people>');
    expect(text).toContain('</people>');
  });
});

describe('csvToHtml', () => {
  it('produces an HTML table with headers and rows', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToHtml(file);
    const text = await blob.text();
    expect(text).toContain('<th>name</th>');
    expect(text).toContain('<th>age</th>');
    expect(text).toContain('<td>Alice</td>');
    expect(text).toContain('<td>30</td>');
  });
});

describe('csvToYaml', () => {
  it('produces YAML content with parsed values', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToYaml(file);
    const text = await blob.text();
    expect(text).toContain('name: Alice');
    expect(text).toContain('age: 30');
  });
});

describe('csvToTxt', () => {
  it('produces plain-text output with rows joined', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToTxt(file);
    const text = await blob.text();
    expect(text).toContain('name');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('does not crash on empty input', async () => {
    const file = new File([''], 'empty.csv', { type: 'text/csv' });
    const blob = await csvToTxt(file);
    const text = await blob.text();
    expect(text).toBe('');
  });
});

describe('tsvToJson', () => {
  it('parses TSV into JSON array of objects', async () => {
    const tsv = 'name\tage\nAlice\t30\nBob\t25';
    const file = new File([tsv], 'test.tsv', { type: 'text/tab-separated-values' });
    const blob = await tsvToJson(file, 'tsv', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });
});

describe('tsvToXml', () => {
  it('wraps TSV rows in XML with default root', async () => {
    const tsv = 'name\tage\nAlice\t30\nBob\t25';
    const file = new File([tsv], 'test.tsv', { type: 'text/tab-separated-values' });
    const blob = await tsvToXml(file, 'tsv', 'xml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('<root>');
    expect(text).toContain('<name>Alice</name>');
  });
});

describe('tsvToHtml', () => {
  it('produces an HTML table from TSV', async () => {
    const tsv = 'name\tage\nAlice\t30\nBob\t25';
    const file = new File([tsv], 'test.tsv', { type: 'text/tab-separated-values' });
    const blob = await tsvToHtml(file, 'tsv', 'html', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('<th>name</th>');
    expect(text).toContain('<td>Alice</td>');
  });
});
