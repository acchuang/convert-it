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
