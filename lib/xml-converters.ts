import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export function xmlToJson(file: File): Promise<Blob> {
  return file.text().then(text => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const result = parser.parse(text);
    return new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
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

export function jsonToXml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ root: data })}`;
    return new Blob([xml], { type: 'application/xml' });
  });
}