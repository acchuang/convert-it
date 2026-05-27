import type { FileCategory, FormatInfo, ConverterFn, ConversionSettings } from './types';
import { csvToJson, csvToTsv, csvToXml, csvToHtml, tsvToCsv, tsvToJson, jsonToCsv, csvToYaml, csvToTxt, tsvToXml, tsvToHtml, jsonToTsv, jsonToHtml } from './csv-converters';
import { xmlToJson, xmlToTxt, jsonToXml, xmlToCsv, xmlToYaml, xmlToTsv } from './xml-converters';
import { yamlToJson, jsonToYaml, yamlToCsv, yamlToXml, yamlToTsv } from './yaml-converters';
import { mdToHtml, htmlToMd, htmlToTxt, txtToHtml, txtToMd, jsonToTxt, jsonToMd } from './markdown-converters';
import { convertImage } from './image-converters';
import convertHeic from './heic-converter';
import convertAvif from './avif-converter';
import { xlsxToCsv, xlsxToJson, csvToXlsx, jsonToXlsx } from './xlsx-converters';
import { convertAudioVideo, extractAudio } from './audio-video-converters';
import { txtToPdf, mdToPdf, htmlToPdf, jsonToPdf } from './pdf-converters';
import { txtToEpub, mdToEpub, htmlToEpub } from './epub-converter';

export type { FileCategory, FormatInfo, ConverterFn, ConversionSettings } from './types';
export { DEFAULT_SETTINGS } from './types';

export const FORMATS: FormatInfo[] = [
  // Images
  { ext: 'jpg',  label: 'JPEG',  mimeType: 'image/jpeg',            category: 'image' },
  { ext: 'png',  label: 'PNG',   mimeType: 'image/png',             category: 'image' },
  { ext: 'webp', label: 'WebP',  mimeType: 'image/webp',            category: 'image' },
  { ext: 'gif',  label: 'GIF',   mimeType: 'image/gif',             category: 'image' },
  { ext: 'bmp',  label: 'BMP',   mimeType: 'image/bmp',             category: 'image' },
  { ext: 'ico',  label: 'ICO',   mimeType: 'image/x-icon',          category: 'image' },
  { ext: 'svg',  label: 'SVG',   mimeType: 'image/svg+xml',         category: 'image' },
  { ext: 'heic', label: 'HEIC',  mimeType: 'image/heic',            category: 'image' },
  { ext: 'avif', label: 'AVIF',  mimeType: 'image/avif',            category: 'image' },
  // Video
  { ext: 'mp4',  label: 'MP4',   mimeType: 'video/mp4',             category: 'video' },
  { ext: 'webm', label: 'WebM',  mimeType: 'video/webm',            category: 'video' },
  { ext: 'avi',  label: 'AVI',   mimeType: 'video/x-msvideo',       category: 'video' },
  { ext: 'mov',  label: 'MOV',   mimeType: 'video/quicktime',       category: 'video' },
  { ext: 'mkv',  label: 'MKV',   mimeType: 'video/x-matroska',      category: 'video' },
  { ext: 'flv',  label: 'FLV',   mimeType: 'video/x-flv',           category: 'video' },
  { ext: 'm4v',  label: 'M4V',   mimeType: 'video/mp4',             category: 'video' },
  { ext: '3gp',  label: '3GP',   mimeType: 'video/3gpp',            category: 'video' },
  // Audio
  { ext: 'mp3',  label: 'MP3',   mimeType: 'audio/mpeg',            category: 'audio' },
  { ext: 'wav',  label: 'WAV',   mimeType: 'audio/wav',             category: 'audio' },
  { ext: 'aac',  label: 'AAC',   mimeType: 'audio/aac',             category: 'audio' },
  { ext: 'ogg',  label: 'OGG',   mimeType: 'audio/ogg',             category: 'audio' },
  { ext: 'flac', label: 'FLAC',  mimeType: 'audio/flac',            category: 'audio' },
  { ext: 'm4a',  label: 'M4A',   mimeType: 'audio/mp4',             category: 'audio' },
  { ext: 'wma',  label: 'WMA',   mimeType: 'audio/x-ms-wma',        category: 'audio' },
  { ext: 'opus', label: 'OPUS',  mimeType: 'audio/opus',            category: 'audio' },
  // Documents
  { ext: 'txt',  label: 'TXT',   mimeType: 'text/plain',            category: 'document' },
  { ext: 'md',   label: 'Markdown', mimeType: 'text/markdown',      category: 'document' },
  { ext: 'html', label: 'HTML',  mimeType: 'text/html',             category: 'document' },
  { ext: 'pdf',  label: 'PDF',   mimeType: 'application/pdf',       category: 'document' },
  { ext: 'epub', label: 'ePub',  mimeType: 'application/epub+zip', category: 'document' },
  // Data
  { ext: 'csv',  label: 'CSV',   mimeType: 'text/csv',              category: 'data' },
  { ext: 'json', label: 'JSON',  mimeType: 'application/json',      category: 'data' },
  { ext: 'xml',  label: 'XML',   mimeType: 'application/xml',       category: 'data' },
  { ext: 'yaml', label: 'YAML',  mimeType: 'application/yaml',      category: 'data' },
  { ext: 'tsv',  label: 'TSV',   mimeType: 'text/tab-separated-values', category: 'data' },
  { ext: 'xlsx', label: 'Excel', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'data' },
];

const IMAGE_CONVERSIONS: Record<string, string[]> = {
  jpg:  ['png', 'webp', 'bmp', 'ico', 'jpg'],
  jpeg: ['png', 'webp', 'bmp', 'ico', 'jpg'],
  png:  ['jpg', 'webp', 'bmp', 'ico', 'png'],
  webp: ['jpg', 'png',  'bmp', 'webp'],
  gif:  ['png', 'jpg',  'webp'],
  bmp:  ['jpg', 'png',  'webp'],
  ico:  ['png', 'jpg',  'webp', 'bmp'],
  svg:  ['png', 'jpg',  'webp'],
  heic: ['jpg', 'png', 'webp', 'bmp', 'ico'],
  avif: ['jpg', 'png', 'webp', 'bmp', 'ico'],
};

const VIDEO_CONVERSIONS: Record<string, string[]> = {
  mp4:  ['webm', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  webm: ['mp4', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  avi:  ['mp4', 'webm', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  mov:  ['mp4', 'webm', 'avi', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  mkv:  ['mp4', 'webm', 'avi', 'mov', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  flv:  ['mp4', 'webm', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  m4v:  ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
  '3gp': ['mp4', 'webm', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'aac', 'webp'],
};

const AUDIO_CONVERSIONS: Record<string, string[]> = {
  mp3:  ['wav', 'aac', 'ogg', 'flac', 'm4a'],
  wav:  ['mp3', 'aac', 'ogg', 'flac', 'm4a'],
  aac:  ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
  ogg:  ['mp3', 'wav', 'aac', 'flac', 'm4a'],
  flac: ['mp3', 'wav', 'aac', 'ogg', 'm4a'],
  m4a:  ['mp3', 'wav', 'aac', 'ogg', 'flac'],
  wma:  ['mp3', 'wav', 'aac', 'ogg', 'm4a'],
  opus: ['mp3', 'wav', 'aac', 'ogg', 'm4a'],
};

const CONVERTER_REGISTRY: Record<string, ConverterFn> = {
  'csv:json':   csvToJson,
  'csv:tsv':    csvToTsv,
  'csv:xml':    csvToXml,
  'csv:html':   csvToHtml,
  'csv:xlsx':   csvToXlsx,
  'csv:yaml':   csvToYaml,
  'csv:txt':    csvToTxt,
  'tsv:csv':    tsvToCsv,
  'tsv:json':   tsvToJson,
  'tsv:xml':    tsvToXml,
  'tsv:html':   tsvToHtml,
  'json:csv':   jsonToCsv,
  'json:xml':   jsonToXml,
  'json:yaml':  jsonToYaml,
  'json:txt':   jsonToTxt,
  'json:xlsx':  jsonToXlsx,
  'json:tsv':   jsonToTsv,
  'json:html':  jsonToHtml,
  'json:md':    jsonToMd,
  'json:pdf':   jsonToPdf,
  'xml:json':   xmlToJson,
  'xml:txt':    xmlToTxt,
  'xml:csv':    xmlToCsv,
  'xml:yaml':   xmlToYaml,
  'xml:tsv':    xmlToTsv,
  'yaml:json':  yamlToJson,
  'yaml:csv':   yamlToCsv,
  'yaml:xml':   yamlToXml,
  'yaml:tsv':   yamlToTsv,
  'md:html':    mdToHtml,
  'md:pdf':     mdToPdf,
  'html:md':    htmlToMd,
  'html:txt':   htmlToTxt,
  'html:pdf':   htmlToPdf,
  'txt:html':   txtToHtml,
  'txt:md':     txtToMd,
  'txt:pdf':    txtToPdf,
  'xlsx:csv':   xlsxToCsv,
  'xlsx:json':  xlsxToJson,
  'txt:epub':   txtToEpub,
  'md:epub':    mdToEpub,
  'html:epub':  htmlToEpub,
};

function buildConversionMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {
    ...IMAGE_CONVERSIONS,
    ...VIDEO_CONVERSIONS,
    ...AUDIO_CONVERSIONS,
  };

  for (const key of Object.keys(CONVERTER_REGISTRY)) {
    const [source, target] = key.split(':');
    if (!map[source]) map[source] = [];
    if (!map[source].includes(target)) {
      map[source].push(target);
    }
  }

  return map;
}

export const CONVERSION_MAP: Record<string, string[]> = buildConversionMap();

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

export async function convertFile(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const sourceExt = getFileExtension(file.name);

  if (sourceExt === 'heic') return convertHeic(file, targetExt, settings);
  if (sourceExt === 'avif') return convertAvif(file, targetExt, settings);

  const category = getFormatInfo(sourceExt)?.category;

  if (category === 'image') {
    return convertImage(file, sourceExt, targetExt, settings);
  }

  if (category === 'video' || category === 'audio') {
    if (category === 'video' && ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(targetExt)) {
      return extractAudio(file, sourceExt, targetExt, settings, onProgress);
    }
    return convertAudioVideo(file, sourceExt, targetExt, settings, onProgress);
  }

  const key = `${sourceExt}:${targetExt}`;
  const converter = CONVERTER_REGISTRY[key];
  if (converter) {
    return converter(file, sourceExt, targetExt, settings, onProgress);
  }

  throw new Error(`Unsupported conversion: ${sourceExt} → ${targetExt}`);
}
