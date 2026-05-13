import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { ConversionSettings } from './types';

export function xmlToJson(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const result = parser.parse(text);
    const json = indent === 0
      ? JSON.stringify(result)
      : JSON.stringify(result, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export function xmlToTxt(file: File): Promise<Blob> {
  return file.text().then(text => {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const plain = doc.documentElement?.textContent ?? '';
    const trimmed = plain.replace(/\n{3,}/g, '\n\n').trim();
    return new Blob([trimmed], { type: 'text/plain' });
  });
}

export async function xmlToCsv(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const delimiter = settings?.csvDelimiter ?? ',';
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const rows = doc.querySelectorAll('row');
  if (rows.length === 0) throw new Error('No <row> elements found in XML');
  const data: Record<string, string>[] = [];
  rows.forEach(row => {
    const obj: Record<string, string> = {};
    row.querySelectorAll(':scope > *').forEach(el => {
      obj[el.tagName] = el.textContent ?? '';
    });
    data.push(obj);
  });
  const csv = Papa.unparse(data, { delimiter });
  return new Blob([csv], { type: 'text/csv' });
}

export async function xmlToYaml(file: File): Promise<Blob> {
  const { stringify } = await import('yaml');
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const rows = doc.querySelectorAll('row');
  const data: Record<string, string>[] = [];
  rows.forEach(row => {
    const obj: Record<string, string> = {};
    row.querySelectorAll(':scope > *').forEach(el => {
      obj[el.tagName] = el.textContent ?? '';
    });
    data.push(obj);
  });
  const y = stringify(data.length > 0 ? data : [], { lineWidth: 0 });
  return new Blob([y], { type: 'application/yaml' });
}

export async function xmlToTsv(file: File): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const rows = doc.querySelectorAll('row');
  if (rows.length === 0) throw new Error('No <row> elements found in XML');
  const data: Record<string, string>[] = [];
  rows.forEach(row => {
    const obj: Record<string, string> = {};
    row.querySelectorAll(':scope > *').forEach(el => {
      obj[el.tagName] = el.textContent ?? '';
    });
    data.push(obj);
  });
  const tsv = Papa.unparse(data, { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export function jsonToXml(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  return file.text().then(text => {
    const data = JSON.parse(text);
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ [rootEl]: data })}`;
    return new Blob([xml], { type: 'application/xml' });
  });
}
