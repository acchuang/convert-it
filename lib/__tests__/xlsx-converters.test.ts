import { describe, it, expect } from 'vitest';
import { xlsxToCsv, xlsxToJson, csvToXlsx, jsonToXlsx } from '@/lib/xlsx-converters';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DEFAULT_SETTINGS } from '@/lib/types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV = 'name,age\nAlice,30\nBob,25';

describe('csvToXlsx', () => {
  it('produces a non-empty Blob with the correct xlsx mimeType', async () => {
    const file = new File([CSV], 'test.csv', { type: 'text/csv' });
    const blob = await csvToXlsx(file, 'csv', 'xlsx', DEFAULT_SETTINGS);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe(XLSX_MIME);
  });
});

describe('jsonToXlsx', () => {
  it('produces a non-empty Blob with the correct xlsx mimeType', async () => {
    const json = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    const file = new File([json], 'test.json', { type: 'application/json' });
    const blob = await jsonToXlsx(file, 'json', 'xlsx', DEFAULT_SETTINGS);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe(XLSX_MIME);
  });

  it('wraps a single JSON object into a one-row sheet', async () => {
    const json = JSON.stringify({ name: 'Alice', age: 30 });
    const file = new File([json], 'single.json', { type: 'application/json' });
    const blob = await jsonToXlsx(file, 'json', 'xlsx', DEFAULT_SETTINGS);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('xlsxToCsv (round trip via csvToXlsx)', () => {
  it('round-trips CSV data through xlsx and back to CSV', async () => {
    const csvFile = new File([CSV], 'test.csv', { type: 'text/csv' });
    const xlsxBlob = await csvToXlsx(csvFile, 'csv', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const csvBlob = await xlsxToCsv(xlsxFile, 'xlsx', 'csv', DEFAULT_SETTINGS);
    const csvText = await csvBlob.text();

    expect(csvText).toContain('name');
    expect(csvText).toContain('age');
    expect(csvText).toContain('Alice');
    expect(csvText).toContain('30');
    expect(csvText).toContain('Bob');
    expect(csvText).toContain('25');
  });

  it('respects custom csvDelimiter setting', async () => {
    const csvFile = new File([CSV], 'test.csv', { type: 'text/csv' });
    const xlsxBlob = await csvToXlsx(csvFile, 'csv', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const csvBlob = await xlsxToCsv(xlsxFile, 'xlsx', 'csv', {
      ...DEFAULT_SETTINGS,
      csvDelimiter: ';',
    });
    const csvText = await csvBlob.text();

    expect(csvText).toContain('name;age');
  });
});

describe('xlsxToJson (round trip via jsonToXlsx)', () => {
  it('round-trips JSON data through xlsx and back to JSON', async () => {
    const original = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const jsonFile = new File([JSON.stringify(original)], 'test.json', {
      type: 'application/json',
    });
    const xlsxBlob = await jsonToXlsx(jsonFile, 'json', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const jsonBlob = await xlsxToJson(xlsxFile, 'xlsx', 'json', DEFAULT_SETTINGS);
    const text = await jsonBlob.text();
    const data = JSON.parse(text);

    expect(data).toEqual(original);
  });

  it('respects jsonIndent setting of 0 (minified)', async () => {
    const original = [{ name: 'Alice', age: 30 }];
    const jsonFile = new File([JSON.stringify(original)], 'test.json', {
      type: 'application/json',
    });
    const xlsxBlob = await jsonToXlsx(jsonFile, 'json', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const jsonBlob = await xlsxToJson(xlsxFile, 'xlsx', 'json', {
      ...DEFAULT_SETTINGS,
      jsonIndent: 0,
    });
    const text = await jsonBlob.text();

    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual(original);
  });
});

describe('csvToXlsx type inference', () => {
  it('keeps leading-zero IDs as text and converts plain numbers and booleans', async () => {
    const { readWorkbook } = await import('@/lib/xlsx');
    const file = new File(['id,n,flag\n007,42,TRUE\n1e5,3.50,no'], 'a.csv');
    const blob = await csvToXlsx(file, 'csv', 'xlsx', DEFAULT_SETTINGS);
    const [sheet] = await readWorkbook(await blob.arrayBuffer());
    expect(sheet.rows).toEqual([
      ['id', 'n', 'flag'],
      ['007', 42, true],
      ['1e5', '3.50', 'no'],
    ]);
  });
});

describe('all sheets (xlsxAllSheets)', () => {
  const fixture = () =>
    new File([readFileSync(join(__dirname, 'fixtures', 'sheetjs-types.xlsx'))], 'book.xlsx', {
      type: XLSX_MIME,
    });

  it('xlsx → csv zips one CSV per sheet', async () => {
    const blob = await xlsxToCsv(fixture(), 'xlsx', 'csv', {
      ...DEFAULT_SETTINGS,
      xlsxAllSheets: true,
    });
    expect(blob.type).toBe('application/zip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['book-People.csv', 'book-Other.csv']);
    expect(await zip.file('book-Other.csv')!.async('string')).toBe('second,sheet');
  });

  it('first sheet only by default', async () => {
    const blob = await xlsxToCsv(fixture(), 'xlsx', 'csv', DEFAULT_SETTINGS);
    expect(blob.type).toBe('text/csv');
    expect(await blob.text()).toMatch(/^name,age,joined/);
  });

  it('xlsx → json keys every sheet by name', async () => {
    const blob = await xlsxToJson(fixture(), 'xlsx', 'json', {
      ...DEFAULT_SETTINGS,
      xlsxAllSheets: true,
    });
    const data = JSON.parse(await blob.text());
    expect(Object.keys(data)).toEqual(['People', 'Other']);
    expect(data.People[0].name).toBe('Alice');
    expect(data.Other).toEqual([]);
  });

  it('makes hostile or colliding sheet names safe file names', async () => {
    const { writeWorkbook } = await import('@/lib/xlsx');
    // Build a 3-sheet workbook by hand: writeWorkbook emits one sheet, so
    // clone its sheet part under three names.
    const one = await JSZip.loadAsync(await (await writeWorkbook([['x']])).arrayBuffer());
    const sheetXml = await one.file('xl/worksheets/sheet1.xml')!.async('string');
    const names = ['a/b', 'a:b', '__proto__'];
    one.file(
      'xl/workbook.xml',
      `<workbook xmlns:r="r"><sheets>${names
        .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 10}"/>`)
        .join('')}</sheets></workbook>`,
    );
    one.file(
      'xl/_rels/workbook.xml.rels',
      `<Relationships>${names
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 10}" Type="x/worksheet" Target="worksheets/s${i}.xml"/>`,
        )
        .join('')}</Relationships>`,
    );
    names.forEach((_, i) => one.file(`xl/worksheets/s${i}.xml`, sheetXml));
    const file = new File([await one.generateAsync({ type: 'uint8array' })], 'b.xlsx');

    const zip = await JSZip.loadAsync(
      await (
        await xlsxToCsv(file, 'xlsx', 'csv', { ...DEFAULT_SETTINGS, xlsxAllSheets: true })
      ).arrayBuffer(),
    );
    expect(Object.keys(zip.files)).toEqual(['b-a_b.csv', 'b-a_b (2).csv', 'b-__proto__.csv']);

    const json = JSON.parse(
      await (
        await xlsxToJson(file, 'xlsx', 'json', { ...DEFAULT_SETTINGS, xlsxAllSheets: true })
      ).text(),
    );
    expect(Object.keys(json)).toEqual(['a/b', 'a:b', '__proto__']);
    expect(Object.prototype).not.toHaveProperty('x');
  });
});
