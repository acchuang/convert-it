import Papa from 'papaparse';
import type { ConversionSettings } from './types';
import { XLSX_MIME, cellToText, readWorkbook, sheetToObjects, writeWorkbook } from './xlsx';
import type { Sheet } from './xlsx';
import { safeFileStem, uniqueName } from './filenames';

function sheetToCsv(sheet: Sheet, delimiter: string): string {
  return Papa.unparse(
    sheet.rows.map((row) => row.map(cellToText)),
    { delimiter },
  );
}

/**
 * First sheet by default. With `xlsxAllSheets`, every sheet: one CSV each in a
 * zip (`<file>-<sheet>.csv`), or the plain CSV when there is only one sheet.
 */
export async function xlsxToCsv(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const sheets = await readWorkbook(await file.arrayBuffer());
  const delimiter = settings?.csvDelimiter ?? ',';
  if (!settings?.xlsxAllSheets || sheets.length === 1) {
    return new Blob([sheetToCsv(sheets[0], delimiter)], { type: 'text/csv' });
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const base = file.name.replace(/\.[^.]+$/, '');
  const used = new Set<string>();
  for (const sheet of sheets) {
    const name = uniqueName(`${base}-${safeFileStem(sheet.name, 'sheet')}.csv`, used);
    zip.file(name, sheetToCsv(sheet, delimiter));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/** First sheet's rows by default; with `xlsxAllSheets`, `{ "<sheet name>": rows, … }`. */
export async function xlsxToJson(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  const sheets = await readWorkbook(await file.arrayBuffer());
  let data: unknown;
  if (settings?.xlsxAllSheets) {
    // A null-prototype object: sheet names are user data, and "__proto__" is a
    // legal one.
    const bySheet: Record<string, unknown> = Object.create(null);
    for (const sheet of sheets) bySheet[sheet.name] = sheetToObjects(sheet);
    data = bySheet;
  } else {
    data = sheetToObjects(sheets[0]);
  }
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
