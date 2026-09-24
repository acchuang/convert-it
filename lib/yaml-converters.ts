import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { ConversionSettings } from './types';
import { rowsToXml } from './markup';

function toArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') return [data as Record<string, unknown>];
  return [{ value: data }];
}

export function yamlToJson(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const data = yamlParse(text);
    const json = indent === 0
      ? JSON.stringify(data)
      : JSON.stringify(data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export async function yamlToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const delimiter = settings?.csvDelimiter ?? ',';
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const csv = Papa.unparse(arr, { delimiter });
  return new Blob([csv], { type: 'text/csv' });
}

export async function yamlToXml(file: File, _s: string, _t: string, settings?: ConversionSettings, _onProgress?: (pct: number) => void): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const xml = rowsToXml(arr, rootEl);
  return new Blob([xml], { type: 'application/xml' });
}

export async function yamlToTsv(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const data = yamlParse(text);
  const arr = toArray(data);
  const tsv = Papa.unparse(arr, { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export function jsonToYaml(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const yaml = yamlStringify(data, { lineWidth: 0 });
    return new Blob([yaml], { type: 'application/yaml' });
  });
}
