import Papa from 'papaparse';
import type { ConversionSettings } from './types';
import { rowsToHtmlTable, rowsToXml } from './markup';

export function csvToJson(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then((text) => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const json =
      indent === 0 ? JSON.stringify(result.data) : JSON.stringify(result.data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export function csvToTsv(file: File): Promise<Blob> {
  return file.text().then((text) => {
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const tsv = result.data.map((row) => row.join('\t')).join('\n');
    return new Blob([tsv], { type: 'text/tab-separated-values' });
  });
}

export function csvToXml(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  return file.text().then((text) => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const xml = rowsToXml(result.data, rootEl);
    return new Blob([xml], { type: 'application/xml' });
  });
}

export function csvToHtml(file: File): Promise<Blob> {
  return file.text().then((text) => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const html = rowsToHtmlTable(result.meta.fields ?? [], result.data);
    return new Blob([html], { type: 'text/html' });
  });
}

export async function csvToYaml(file: File): Promise<Blob> {
  const { stringify } = await import('yaml');
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  const y = stringify(result.data, { lineWidth: 0 });
  return new Blob([y], { type: 'application/yaml' });
}

export async function csvToTxt(file: File): Promise<Blob> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
  const lines = result.data.map((row) => {
    return row
      .map((cell) => {
        if (!cell.includes(',') && !cell.includes('"') && !cell.includes('\n')) return cell;
        return `"${cell.replace(/"/g, '""')}"`;
      })
      .join('  ');
  });
  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

export function tsvToCsv(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const delimiter = settings?.csvDelimiter ?? ',';
  return file.text().then((text) => {
    const result = Papa.parse(text, { header: false, delimiter: '\t', skipEmptyLines: true });
    const csv = Papa.unparse(result.data, { delimiter });
    return new Blob([csv], { type: 'text/csv' });
  });
}

export function tsvToJson(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then((text) => {
    const result = Papa.parse(text, {
      header: true,
      delimiter: '\t',
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    const json =
      indent === 0 ? JSON.stringify(result.data) : JSON.stringify(result.data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export async function tsvToXml(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: '	',
    skipEmptyLines: true,
  });
  const xml = rowsToXml(result.data, rootEl);
  return new Blob([xml], { type: 'application/xml' });
}

export async function tsvToHtml(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: '\t',
    skipEmptyLines: true,
  });
  const html = rowsToHtmlTable(result.meta.fields ?? [], result.data);
  return new Blob([html], { type: 'text/html' });
}

export function jsonToCsv(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const delimiter = settings?.csvDelimiter ?? ',';
  return file.text().then((text) => {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    const csv = Papa.unparse(arr, { delimiter });
    return new Blob([csv], { type: 'text/csv' });
  });
}

export async function jsonToTsv(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  const tsv = Papa.unparse(arr, { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export async function jsonToHtml(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  const rows = arr.map((row) =>
    row !== null && typeof row === 'object' ? row : { value: row },
  ) as Record<string, unknown>[];
  // Union of keys in first-seen order: a column only the third row has still gets a header.
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const html = rowsToHtmlTable(headers, rows);
  return new Blob([html], { type: 'text/html' });
}
