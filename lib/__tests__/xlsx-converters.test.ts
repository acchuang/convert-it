import { describe, it, expect } from 'vitest';
import { xlsxToCsv, xlsxToJson, csvToXlsx, jsonToXlsx } from '@/lib/xlsx-converters';
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
    const csvBlob = await xlsxToCsv(xlsxFile, 'xlsx', 'csv', { ...DEFAULT_SETTINGS, csvDelimiter: ';' });
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
    const jsonFile = new File([JSON.stringify(original)], 'test.json', { type: 'application/json' });
    const xlsxBlob = await jsonToXlsx(jsonFile, 'json', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const jsonBlob = await xlsxToJson(xlsxFile, 'xlsx', 'json', DEFAULT_SETTINGS);
    const text = await jsonBlob.text();
    const data = JSON.parse(text);

    expect(data).toEqual(original);
  });

  it('respects jsonIndent setting of 0 (minified)', async () => {
    const original = [{ name: 'Alice', age: 30 }];
    const jsonFile = new File([JSON.stringify(original)], 'test.json', { type: 'application/json' });
    const xlsxBlob = await jsonToXlsx(jsonFile, 'json', 'xlsx', DEFAULT_SETTINGS);

    const xlsxFile = new File([xlsxBlob], 'test.xlsx', { type: XLSX_MIME });
    const jsonBlob = await xlsxToJson(xlsxFile, 'xlsx', 'json', { ...DEFAULT_SETTINGS, jsonIndent: 0 });
    const text = await jsonBlob.text();

    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual(original);
  });
});
