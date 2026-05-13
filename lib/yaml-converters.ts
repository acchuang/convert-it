import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { ConversionSettings } from './types';

function toArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') return [data as Record<string, unknown>];
  return [{ value: data }];
}

export function yamlToJson(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const data = yamlParse(text);
    const json = indent === 0
      ? JSON.stringify(data)
      : JSON.stringify(data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export async function yamlToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const delimiter = settings?.csvDelimiter ?? ',';
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const csv = Papa.unparse(arr, { delimiter });
  return new Blob([csv], { type: 'text/csv' });
}

export async function yamlToXml(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const rows = arr.map(row => {
    const fields = Object.entries(row).map(([k, v]) => `    <${k}>${v ?? ''}</${k}>`).join('\n');
    return `  <row>\n${fields}\n  </row>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootEl}>\n${rows.join('\n')}\n</${rootEl}>`;
  return new Blob([xml], { type: 'application/xml' });
}

export async function yamlToTsv(file: File): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const tsv = Papa.unparse(arr, { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export function jsonToYaml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const yaml = yamlStringify(data, { lineWidth: 0 });
    return new Blob([yaml], { type: 'application/yaml' });
  });
}
