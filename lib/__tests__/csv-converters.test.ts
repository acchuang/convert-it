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
import { jsonToHtml } from '@/lib/csv-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

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
    const blob = await csvToXml(file, 'csv', 'xml', {
      ...DEFAULT_SETTINGS,
      xmlRootElement: 'people',
    });
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

// Real spreadsheets: headers with spaces and leading digits, values with markup.
const HOSTILE_CSV = 'First Name,2024,Notes\nAT&T,<b>x</b>,"a < b, ""quoted"""';

describe('XML output is well-formed for real-world headers and values', () => {
  it('csvToXml', async () => {
    const blob = await csvToXml(new File([HOSTILE_CSV], 'a.csv'), 'csv', 'xml', DEFAULT_SETTINGS);
    const doc = parseXml(await blob.text());
    expect(doc.getElementsByTagName('First_Name')[0].textContent).toBe('AT&T');
    expect(doc.getElementsByTagName('_2024')[0].textContent).toBe('<b>x</b>');
    expect(doc.getElementsByTagName('Notes')[0].textContent).toBe('a < b, "quoted"');
  });

  it('tsvToXml', async () => {
    const tsv = 'First Name\tNotes\nAT&T\t<i>';
    const blob = await tsvToXml(new File([tsv], 'a.tsv'), 'tsv', 'xml', DEFAULT_SETTINGS);
    parseXml(await blob.text());
  });

  it('sanitises a root element name typed into settings', async () => {
    const blob = await csvToXml(new File([CSV], 'a.csv'), 'csv', 'xml', {
      ...DEFAULT_SETTINGS,
      xmlRootElement: 'my people',
    });
    expect(parseXml(await blob.text()).documentElement.tagName).toBe('my_people');
  });
});

describe('HTML table output escapes cell content', () => {
  const evil = 'name,bio\nEve,<script>alert(1)</script>';

  it('csvToHtml', async () => {
    const html = await (await csvToHtml(new File([evil], 'a.csv'))).text();
    expect(html).not.toContain('<script>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('td')[1].textContent).toBe('<script>alert(1)</script>');
  });

  it('tsvToHtml', async () => {
    const html = await (
      await tsvToHtml(new File(['a\n<img src=x onerror=alert(1)>'], 'a.tsv'), 'tsv', 'html')
    ).text();
    expect(html).not.toContain('<img');
  });

  it('jsonToHtml escapes, keeps nested values as JSON, and unions keys', async () => {
    const json = JSON.stringify([{ a: '<b>' }, { a: 1, extra: { deep: true } }]);
    const html = await (await jsonToHtml(new File([json], 'a.json'), 'json', 'html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect([...doc.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['a', 'extra']);
    expect(doc.querySelector('td')?.textContent).toBe('<b>');
    expect(html).toContain('{&quot;deep&quot;:true}');
    expect(html).not.toContain('[object Object]');
  });
});
