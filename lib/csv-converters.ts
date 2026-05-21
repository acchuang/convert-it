import Papa from 'papaparse';
import type { ConversionSettings } from './types';

export function csvToJson(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const json = indent === 0
      ? JSON.stringify(result.data)
      : JSON.stringify(result.data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export function csvToTsv(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const tsv = result.data.map(row => row.join('\t')).join('\n');
    return new Blob([tsv], { type: 'text/tab-separated-values' });
  });
}

export function csvToXml(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  return file.text().then(text => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = result.data.map(row => {
      const fields = Object.entries(row)
        .map(([k, v]) => `    <${k}>${v ?? ''}</${k}>`)
        .join('\n');
      return `  <row>\n${fields}\n  </row>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootEl}>\n${rows.join('\n')}\n</${rootEl}>`;
    return new Blob([xml], { type: 'application/xml' });
  });
}

export function csvToHtml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields ?? [];
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = result.data.map(row => {
      const cells = headers.map(h => `<td>${row[h] ?? ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');
    const html = `<!DOCTYPE html>\n<html>\n<body>\n<table border="1">\n${thead}\n<tbody>\n${tbody}\n</tbody>\n</table>\n</body>\n</html>`;
    return new Blob([html], { type: 'text/html' });
  });
}

export async function csvToYaml(file: File): Promise<Blob> {
  const { stringify } = await import('yaml');
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
  const y = stringify(result.data, { lineWidth: 0 });
  return new Blob([y], { type: 'application/yaml' });
}

export async function csvToTxt(file: File): Promise<Blob> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
  const lines = result.data.map(row => {
    return row.map(cell => {
      if (!cell.includes(',') && !cell.includes('"') && !cell.includes('\n')) return cell;
      return `"${cell.replace(/"/g, '""')}"`;
    }).join('  ');
  });
  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

export function tsvToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const delimiter = settings?.csvDelimiter ?? ',';
  return file.text().then(text => {
    const result = Papa.parse(text, { header: false, delimiter: '\t', skipEmptyLines: true });
    const csv = Papa.unparse(result.data, { delimiter });
    return new Blob([csv], { type: 'text/csv' });
  });
}

export function tsvToJson(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const result = Papa.parse(text, { header: true, delimiter: '\t', skipEmptyLines: true, dynamicTyping: true });
    const json = indent === 0
      ? JSON.stringify(result.data)
      : JSON.stringify(result.data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export async function tsvToXml(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, { header: true, delimiter: '\t', skipEmptyLines: true });
  const rows = result.data.map(row => {
    const fields = Object.entries(row)
      .map(([k, v]) => `    <${k}>${v ?? ''}</${k}>`)
      .join('\n');
    return `  <row>\n${fields}\n  </row>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootEl}>\n${rows.join('\n')}\n</${rootEl}>`;
  return new Blob([xml], { type: 'application/xml' });
}

export async function tsvToHtml(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, { header: true, delimiter: '\t', skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = result.data.map(row => {
    const cells = headers.map(h => `<td>${row[h] ?? ''}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  const html = `<!DOCTYPE html>\n<html>\n<body>\n<table border="1">\n${thead}\n<tbody>\n${tbody}\n</tbody>\n</table>\n</body>\n</html>`;
  return new Blob([html], { type: 'text/html' });
}

export function jsonToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const delimiter = settings?.csvDelimiter ?? ',';
  return file.text().then(text => {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    const csv = Papa.unparse(arr, { delimiter });
    return new Blob([csv], { type: 'text/csv' });
  });
}

export async function jsonToTsv(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  const tsv = Papa.unparse(arr, { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export async function jsonToHtml(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return new Blob(['<table></table>'], { type: 'text/html' });
  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = arr.map((row: Record<string, unknown>) => {
    const cells = headers.map(h => `<td>${(row[h] ?? '') as string}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  const html = `<!DOCTYPE html>\n<html>\n<body>\n<table border="1">\n${thead}\n<tbody>\n${tbody}\n</tbody>\n</table>\n</body>\n</html>`;
  return new Blob([html], { type: 'text/html' });
}
