import type { ConversionSettings } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Lazy-load SheetJS so it doesn't bloat the initial bundle (~900KB)
async function sheetjs() {
  return import('xlsx');
}

export async function xlsxToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const XLSX = await sheetjs();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const delimiter = settings?.csvDelimiter ?? ',';
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: delimiter });
  return new Blob([csv], { type: 'text/csv' });
}

export async function xlsxToJson(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const XLSX = await sheetjs();
  const indent = settings?.jsonIndent ?? 2;
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  const json = indent === 0 ? JSON.stringify(data) : JSON.stringify(data, null, indent);
  return new Blob([json], { type: 'application/json' });
}

export async function csvToXlsx(file: File): Promise<Blob> {
  const XLSX = await sheetjs();
  const text = await file.text();
  // XLSX.read can parse CSV directly
  const workbook = XLSX.read(text, { type: 'string' });
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Blob([buffer], { type: XLSX_MIME });
}

export async function jsonToXlsx(file: File): Promise<Blob> {
  const XLSX = await sheetjs();
  const data = JSON.parse(await file.text());
  const arr = Array.isArray(data) ? data : [data];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(arr);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Blob([buffer], { type: XLSX_MIME });
}
