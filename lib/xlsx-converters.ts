import Papa from 'papaparse';
import type { ConversionSettings } from './types';
import { XLSX_MIME, cellToText, readWorkbook, sheetToObjects, writeWorkbook } from './xlsx';

export async function xlsxToCsv(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const [sheet] = await readWorkbook(await file.arrayBuffer());
  const delimiter = settings?.csvDelimiter ?? ',';
  const csv = Papa.unparse(
    sheet.rows.map((row) => row.map(cellToText)),
    { delimiter },
  );
  return new Blob([csv], { type: 'text/csv' });
}

export async function xlsxToJson(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  const [sheet] = await readWorkbook(await file.arrayBuffer());
  const data = sheetToObjects(sheet);
  const json = indent === 0 ? JSON.stringify(data) : JSON.stringify(data, null, indent);
  return new Blob([json], { type: 'application/json' });
}

// Only text that survives a round trip becomes a number, so ZIP codes and IDs
// like "007" or "00123" stay text instead of silently losing their zeros.
function inferCell(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed !== '' && String(Number(trimmed)) === trimmed) return Number(trimmed);
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  return raw;
}

export async function csvToXlsx(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const parsed = Papa.parse<string[]>(await file.text(), { header: false, skipEmptyLines: true });
  return writeWorkbook(parsed.data.map((row) => row.map(inferCell)));
}

export async function jsonToXlsx(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const data = JSON.parse(await file.text());
  const arr: unknown[] = Array.isArray(data) ? data : [data];
  const rows = arr.map((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : { value: item },
  );
  // Union of keys in first-seen order, like SheetJS's json_to_sheet.
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return writeWorkbook([headers, ...rows.map((row) => headers.map((h) => row[h]))]);
}

export { XLSX_MIME };
