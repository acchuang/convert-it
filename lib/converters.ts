import type { FileCategory, FormatInfo, ConverterFn } from './types';
import { csvToJson, csvToTsv, csvToXml, csvToHtml, tsvToCsv, tsvToJson, jsonToCsv } from './csv-converters';
import { xmlToJson, xmlToTxt, jsonToXml } from './xml-converters';
import { yamlToJson, jsonToYaml } from './yaml-converters';
import { mdToHtml, htmlToMd, htmlToTxt, txtToHtml, txtToMd, jsonToTxt } from './markdown-converters';
import { convertImage } from './image-converters';

export type { FileCategory, FormatInfo, ConverterFn } from './types';

export const FORMATS: FormatInfo[] = [
  { ext: 'jpg', label: 'JPEG', mimeType: 'image/jpeg', category: 'image' },
  { ext: 'png', label: 'PNG', mimeType: 'image/png', category: 'image' },
  { ext: 'webp', label: 'WebP', mimeType: 'image/webp', category: 'image' },
  { ext: 'gif', label: 'GIF', mimeType: 'image/gif', category: 'image' },
  { ext: 'bmp', label: 'BMP', mimeType: 'image/bmp', category: 'image' },
  { ext: 'ico', label: 'ICO', mimeType: 'image/x-icon', category: 'image' },
  { ext: 'svg', label: 'SVG', mimeType: 'image/svg+xml', category: 'image' },
  { ext: 'txt', label: 'TXT', mimeType: 'text/plain', category: 'document' },
  { ext: 'md', label: 'Markdown', mimeType: 'text/markdown', category: 'document' },
  { ext: 'html', label: 'HTML', mimeType: 'text/html', category: 'document' },
  { ext: 'csv', label: 'CSV', mimeType: 'text/csv', category: 'data' },
  { ext: 'json', label: 'JSON', mimeType: 'application/json', category: 'data' },
  { ext: 'xml', label: 'XML', mimeType: 'application/xml', category: 'data' },
  { ext: 'yaml', label: 'YAML', mimeType: 'application/yaml', category: 'data' },
  { ext: 'tsv', label: 'TSV', mimeType: 'text/tab-separated-values', category: 'data' },
];

export const CONVERSION_MAP: Record<string, string[]> = {
  jpg: ['png', 'webp', 'bmp', 'ico'],
  jpeg: ['png', 'webp', 'bmp', 'ico'],
  png: ['jpg', 'webp', 'bmp', 'ico'],
  webp: ['jpg', 'png', 'bmp'],
  gif: ['png', 'jpg', 'webp'],
  bmp: ['jpg', 'png', 'webp'],
  svg: ['png', 'jpg', 'webp'],
  txt: ['md', 'html'],
  md: ['html', 'txt'],
  html: ['txt', 'md'],
  csv: ['json', 'xml', 'tsv', 'html'],
  json: ['csv', 'xml', 'yaml', 'txt'],
  xml: ['json', 'txt'],
  yaml: ['json'],
  tsv: ['csv', 'json'],
};

const CONVERTER_REGISTRY: Record<string, ConverterFn> = {
  'csv:json': csvToJson,
  'csv:tsv': csvToTsv,
  'csv:xml': csvToXml,
  'csv:html': csvToHtml,
  'tsv:csv': tsvToCsv,
  'tsv:json': tsvToJson,
  'json:csv': jsonToCsv,
  'json:xml': jsonToXml,
  'json:yaml': jsonToYaml,
  'json:txt': jsonToTxt,
  'xml:json': xmlToJson,
  'xml:txt': xmlToTxt,
  'yaml:json': yamlToJson,
  'md:html': mdToHtml,
  'html:md': htmlToMd,
  'html:txt': htmlToTxt,
  'txt:html': txtToHtml,
  'txt:md': txtToMd,
};

export function getFormatInfo(ext: string): FormatInfo | undefined {
  return FORMATS.find(f => f.ext === ext.toLowerCase());
}

export function getTargetFormats(sourceExt: string): string[] {
  return CONVERSION_MAP[sourceExt.toLowerCase()] ?? [];
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function convertFile(file: File, targetExt: string): Promise<Blob> {
  const sourceExt = getFileExtension(file.name);
  const category = getFormatInfo(sourceExt)?.category;

  if (category === 'image') {
    return convertImage(file, sourceExt, targetExt);
  }

  const key = `${sourceExt}:${targetExt}`;
  const converter = CONVERTER_REGISTRY[key];
  if (converter) {
    return converter(file, sourceExt, targetExt);
  }

  throw new Error(`Unsupported conversion: ${sourceExt} → ${targetExt}`);
}