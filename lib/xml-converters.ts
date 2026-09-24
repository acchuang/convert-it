import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import type { ConversionSettings } from './types';

export function xmlToJson(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then((text) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const result = parser.parse(text);
    const json = indent === 0 ? JSON.stringify(result) : JSON.stringify(result, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

// --- XML → tabular ---------------------------------------------------------
//
// Real-world XML is not the <root><row> shape this app writes: it is
// <catalog><book id="1">…, <feed><entry>…, a SOAP body, an export with a
// header block before the records. The records are found, not assumed: the
// largest run of same-named sibling elements anywhere in the tree (ties go to
// the shallowest). A document with no repeated element is one record, its
// root's content.
//
// fast-xml-parser instead of DOMParser: it works in a Web Worker (DOMParser
// does not), so XML conversions no longer block the page.

const tabularParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  commentPropName: false,
});

type XmlValue = string | XmlObject | XmlValue[];
interface XmlObject {
  [key: string]: XmlValue;
}

function parseXml(text: string): XmlObject {
  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    const { msg, line } = valid.err;
    throw new Error(`Invalid XML (line ${line}): ${msg}`);
  }
  return tabularParser.parse(text) as XmlObject;
}

function isObject(value: unknown): value is XmlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The element children of the document root (the single top-level element). */
function rootContent(doc: XmlObject): XmlValue | undefined {
  const [first] = Object.entries(doc);
  return first?.[1];
}

interface Candidate {
  records: XmlValue[];
  depth: number;
}

function findRecords(node: XmlValue, depth: number, best: Candidate | null): Candidate | null {
  if (Array.isArray(node)) {
    let out = best;
    for (const item of node) out = findRecords(item, depth, out);
    return out;
  }
  if (!isObject(node)) return best;

  let out = best;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@') || key === '#text') continue;
    if (Array.isArray(value) && value.length >= 2) {
      const better =
        !out ||
        value.length > out.records.length ||
        (value.length === out.records.length && depth < out.depth);
      if (better) out = { records: value, depth };
    }
    out = findRecords(value, depth + 1, out);
  }
  return out;
}

// One record → one flat row. Nested elements become dotted paths
// (`address.city`) and attributes `@name` columns. An element's text keeps the
// element's own name, so <price currency="USD">9.99</price> gives `price` and
// `price.@currency`. Repeated children are joined with "; " (or kept as JSON
// when they are structured), so no value is dropped.
function flatten(value: XmlValue, prefix: string, row: Record<string, string>): void {
  if (typeof value === 'string') {
    row[prefix || '#text'] = value;
    return;
  }
  if (Array.isArray(value)) {
    row[prefix || '#text'] = value.every((item) => typeof item === 'string')
      ? (value as string[]).join('; ')
      : JSON.stringify(value);
    return;
  }
  // Attributes first: they are usually the record's identity (id, key, type),
  // and the parser lists them after the child elements.
  const entries = Object.entries(value).sort(
    ([a], [b]) => Number(!a.startsWith('@')) - Number(!b.startsWith('@')),
  );
  for (const [key, child] of entries) {
    const name = key === '#text' ? prefix || '#text' : prefix ? `${prefix}.${key}` : key;
    flatten(child, name, row);
  }
}

// Nothing repeats, so the document is one record. Step through wrapper
// elements that hold nothing but a single child element, so
// <export><item><name>…</name></item></export> gives `name`, not `item.name`.
function unwrap(node: XmlValue): XmlValue {
  let current = node;
  while (isObject(current)) {
    const keys = Object.keys(current);
    if (keys.length !== 1 || keys[0].startsWith('@') || keys[0] === '#text') break;
    const child = current[keys[0]];
    if (!isObject(child)) break;
    current = child;
  }
  return current;
}

/** Records as flat string rows, with the union of their columns in first-seen order. */
export function xmlToRecords(text: string): Record<string, string>[] {
  const doc = parseXml(text);
  const content = rootContent(doc);
  if (content === undefined || content === '') throw new Error('No records found in XML');

  const found = findRecords(content, 0, null);
  const records = found ? found.records : [unwrap(content)];

  const rows = records.map((record) => {
    const row: Record<string, string> = Object.create(null);
    flatten(record, '', row);
    return row;
  });
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  // Same columns on every row, so CSV/TSV/YAML get a proper rectangle.
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const column of columns) out[column] = row[column] ?? '';
    return out;
  });
}

function collectText(value: XmlValue, out: string[]): void {
  if (typeof value === 'string') {
    if (value) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith('@')) collectText(child, out);
    }
  }
}

export function xmlToTxt(file: File): Promise<Blob> {
  return file.text().then((text) => {
    const parts: string[] = [];
    collectText(parseXml(text), parts);
    return new Blob([parts.join('\n')], { type: 'text/plain' });
  });
}

export async function xmlToCsv(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const delimiter = settings?.csvDelimiter ?? ',';
  const csv = Papa.unparse(xmlToRecords(await file.text()), { delimiter });
  return new Blob([csv], { type: 'text/csv' });
}

export async function xmlToYaml(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const { stringify } = await import('yaml');
  const y = stringify(xmlToRecords(await file.text()), { lineWidth: 0 });
  return new Blob([y], { type: 'application/yaml' });
}

export async function xmlToTsv(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const Papa = (await import('papaparse')).default;
  const tsv = Papa.unparse(xmlToRecords(await file.text()), { delimiter: '\t' });
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}

export function jsonToXml(
  file: File,
  _s: string,
  _t: string,
  settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const rootEl = settings?.xmlRootElement ?? 'root';
  return file.text().then((text) => {
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
