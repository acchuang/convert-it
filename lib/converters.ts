import type { ConverterFn, ConversionSettings } from './types';
import { ConversionError } from './errors';
import { getFileExtension } from './formats';
import {
  csvToJson,
  csvToTsv,
  csvToXml,
  csvToHtml,
  tsvToCsv,
  tsvToJson,
  jsonToCsv,
  csvToYaml,
  csvToTxt,
  tsvToXml,
  tsvToHtml,
  jsonToTsv,
  jsonToHtml,
} from './csv-converters';
import { xmlToJson, xmlToTxt, jsonToXml, xmlToCsv, xmlToYaml, xmlToTsv } from './xml-converters';
import { yamlToJson, jsonToYaml, yamlToCsv, yamlToXml, yamlToTsv } from './yaml-converters';
import {
  mdToHtml,
  htmlToMd,
  htmlToTxt,
  txtToHtml,
  txtToMd,
  jsonToTxt,
  jsonToMd,
} from './markdown-converters';
import { convertImage } from './image-converters';
import convertHeic from './heic-converter';
import convertAvif from './avif-converter';
import { xlsxToCsv, xlsxToJson, csvToXlsx, jsonToXlsx } from './xlsx-converters';
import { convertAudioVideo, extractAudio, AUDIO_CODECS } from './audio-video-converters';
import {
  txtToPdf,
  mdToPdf,
  htmlToPdf,
  jsonToPdf,
  pdfToImage,
  pdfToText,
  pdfToHtml,
} from './pdf-converters';
import { txtToEpub, mdToEpub, htmlToEpub } from './epub-converter';
// pdf-lib is ~700 KB: loaded when a PDF tool first runs, not with the page.
const editPdf: ConverterFn = async (...args) => (await import('./pdf-tools')).editPdf(...args);
const imageToPdf: ConverterFn = async (...args) =>
  (await import('./pdf-tools')).imageToPdf(...args);

export type { FileCategory, FormatInfo, ConverterFn, ConversionSettings } from './types';
export { DEFAULT_SETTINGS } from './types';
export { FORMATS, getFormatInfo, getFileExtension, formatFileSize, mimeFor } from './formats';

// The converter registry: every supported (source, target) pair as one
// route, holding what runs it, where it runs, and which settings it reads.
// Before this, that knowledge was spread across three family maps, special
// cases in convertFile, runsOnMainThread in the worker pool, and about ten
// format lists in JobCard that decided which controls to show. Some of those
// lists offered controls that did nothing (a quality slider for PNG, a bitrate
// for WAV, CSV options for XLSX output).

/** A group of controls in the settings panel, and the fields it edits. */
export type SettingKey =
  | 'quality' // quality
  | 'imageTransform' // imageCropAspect, imageResizePercent, imageResizeWidth, imageResizeHeight
  | 'targetSize' // imageTargetSizeKb
  | 'csvDelimiter' // csvDelimiter
  | 'jsonIndent' // jsonIndent
  | 'xmlRoot' // xmlRootElement
  | 'audioBitrate' // audioBitrate
  | 'videoQuality' // videoQuality
  | 'videoPreset' // videoPreset
  | 'animation' // animFps, animWidth
  | 'trim' // trimStart, trimEnd
  | 'pdfPages' // pdfAllPages
  | 'pdfScale' // pdfScale
  | 'pdfEdit' // pdfPageRange, pdfRotate, pdfSplit
  | 'pdfCompress' // pdfCompress
  | 'pdfPageSize' // pdfPageSize
  | 'xlsxSheets'; // xlsxAllSheets

export const SETTING_FIELDS: Record<SettingKey, (keyof ConversionSettings)[]> = {
  quality: ['quality'],
  imageTransform: [
    'imageCropAspect',
    'imageResizePercent',
    'imageResizeWidth',
    'imageResizeHeight',
  ],
  targetSize: ['imageTargetSizeKb'],
  csvDelimiter: ['csvDelimiter'],
  jsonIndent: ['jsonIndent'],
  xmlRoot: ['xmlRootElement'],
  audioBitrate: ['audioBitrate'],
  videoQuality: ['videoQuality'],
  videoPreset: ['videoPreset'],
  animation: ['animFps', 'animWidth'],
  trim: ['trimStart', 'trimEnd'],
  pdfPages: ['pdfAllPages'],
  pdfScale: ['pdfScale'],
  pdfEdit: ['pdfPageRange', 'pdfRotate', 'pdfSplit'],
  pdfCompress: ['pdfCompress'],
  pdfPageSize: ['pdfPageSize'],
  xlsxSheets: ['xlsxAllSheets'],
};

export interface Route {
  from: string;
  to: string;
  run: ConverterFn;
  /** 'main' when the converter needs the DOM or drives ffmpeg.wasm (its own worker). */
  thread: 'worker' | 'main';
  /** The settings this conversion actually reads, in panel order. */
  settings: SettingKey[];
}

const ROUTES: Route[] = [];
const byPair = new Map<string, Route>();

function add(
  from: string,
  to: string,
  run: ConverterFn,
  settings: SettingKey[] = [],
  thread: Route['thread'] = 'worker',
) {
  const route = { from, to, run, thread, settings };
  ROUTES.push(route);
  byPair.set(`${from}:${to}`, route);
}

// --- Images -----------------------------------------------------------------

// Lossy targets have a quality knob and can be compressed to a size budget;
// lossless ones only take crop/resize.
function imageSettings(to: string): SettingKey[] {
  return ['jpg', 'jpeg', 'webp', 'avif', 'jxl'].includes(to)
    ? ['quality', 'imageTransform', 'targetSize']
    : ['imageTransform'];
}

const heic: ConverterFn = (file, _s, to, settings, onProgress) =>
  convertHeic(file, to, settings, onProgress);
const avif: ConverterFn = (file, _s, to, settings, onProgress) =>
  convertAvif(file, to, settings, onProgress);

const IMAGE_TARGETS: Record<string, string[]> = {
  jpg: ['png', 'webp', 'avif', 'jxl', 'bmp', 'ico', 'jpg'],
  jpeg: ['png', 'webp', 'avif', 'jxl', 'bmp', 'ico', 'jpg'],
  png: ['jpg', 'webp', 'avif', 'jxl', 'bmp', 'ico', 'png'],
  webp: ['jpg', 'png', 'avif', 'jxl', 'bmp', 'webp'],
  gif: ['png', 'jpg', 'webp', 'avif'],
  bmp: ['jpg', 'png', 'webp', 'avif', 'jxl'],
  ico: ['png', 'jpg', 'webp', 'bmp'],
  svg: ['png', 'jpg', 'webp', 'avif'],
  heic: ['jpg', 'png', 'webp', 'avif', 'jxl', 'bmp', 'ico'],
  avif: ['jpg', 'png', 'webp', 'jxl', 'bmp', 'ico'],
  jxl: ['png', 'jpg', 'webp', 'avif'],
};
for (const [from, targets] of Object.entries(IMAGE_TARGETS)) {
  const run = from === 'heic' ? heic : from === 'avif' ? avif : convertImage;
  for (const to of targets) add(from, to, run, imageSettings(to));
}

// --- Video and audio (ffmpeg.wasm runs in its own worker, so 'main') ------------

// Lossless audio has no bitrate (buildFfmpegArgs leaves -b:a out for them).
// Every media conversion can be trimmed.
const audioSettings = (to: string): SettingKey[] =>
  AUDIO_CODECS[to]?.bitrate ? ['audioBitrate', 'trim'] : ['trim'];

// mpeg4 (AVI) and Sorenson (FLV) take a fixed quantiser: no speed preset.
function videoSettings(to: string): SettingKey[] {
  if (to === 'gif' || to === 'webp') return ['animation', 'trim'];
  if (to === 'avi' || to === 'flv') return ['videoQuality', 'audioBitrate', 'trim'];
  return ['videoQuality', 'videoPreset', 'audioBitrate', 'trim'];
}

const VIDEO_TARGETS = [
  'mp4',
  'webm',
  'avi',
  'mov',
  'mkv',
  'flv',
  'mp3',
  'wav',
  'aac',
  'ogg',
  'webp',
  'gif',
];
const VIDEO_SOURCES: Record<string, string[]> = {
  mp4: VIDEO_TARGETS.filter((t) => t !== 'mp4'),
  webm: VIDEO_TARGETS.filter((t) => t !== 'webm'),
  avi: VIDEO_TARGETS.filter((t) => t !== 'avi'),
  mov: VIDEO_TARGETS.filter((t) => t !== 'mov'),
  mkv: VIDEO_TARGETS.filter((t) => t !== 'mkv'),
  flv: VIDEO_TARGETS.filter((t) => t !== 'flv'),
  m4v: VIDEO_TARGETS,
  '3gp': VIDEO_TARGETS.filter((t) => t !== 'flv' && t !== 'ogg'),
};
for (const [from, targets] of Object.entries(VIDEO_SOURCES)) {
  for (const to of targets) {
    if (AUDIO_CODECS[to]) add(from, to, extractAudio, audioSettings(to), 'main');
    else add(from, to, convertAudioVideo, videoSettings(to), 'main');
  }
}

const AUDIO_TARGETS = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'];
for (const from of ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma', 'opus']) {
  const targets =
    from === 'wma' || from === 'opus'
      ? ['mp3', 'wav', 'aac', 'ogg', 'm4a']
      : AUDIO_TARGETS.filter((t) => t !== from);
  for (const to of targets) add(from, to, convertAudioVideo, audioSettings(to), 'main');
}

// --- Data --------------------------------------------------------------------

add('csv', 'json', csvToJson, ['jsonIndent']);
add('csv', 'tsv', csvToTsv);
add('csv', 'xml', csvToXml, ['xmlRoot']);
add('csv', 'html', csvToHtml);
add('csv', 'xlsx', csvToXlsx);
add('csv', 'yaml', csvToYaml);
add('csv', 'txt', csvToTxt);
add('tsv', 'csv', tsvToCsv, ['csvDelimiter']);
add('tsv', 'json', tsvToJson, ['jsonIndent']);
add('tsv', 'xml', tsvToXml, ['xmlRoot']);
add('tsv', 'html', tsvToHtml);
add('json', 'csv', jsonToCsv, ['csvDelimiter']);
add('json', 'xml', jsonToXml, ['xmlRoot']);
add('json', 'yaml', jsonToYaml);
add('json', 'txt', jsonToTxt);
add('json', 'xlsx', jsonToXlsx);
add('json', 'tsv', jsonToTsv);
add('json', 'html', jsonToHtml);
add('json', 'md', jsonToMd);
add('json', 'pdf', jsonToPdf);
add('xml', 'json', xmlToJson, ['jsonIndent']);
add('xml', 'txt', xmlToTxt);
add('xml', 'csv', xmlToCsv, ['csvDelimiter']);
add('xml', 'yaml', xmlToYaml);
add('xml', 'tsv', xmlToTsv);
add('yaml', 'json', yamlToJson, ['jsonIndent']);
add('yaml', 'csv', yamlToCsv, ['csvDelimiter']);
add('yaml', 'xml', yamlToXml, ['xmlRoot']);
add('yaml', 'tsv', yamlToTsv);
add('xlsx', 'csv', xlsxToCsv, ['csvDelimiter', 'xlsxSheets']);
add('xlsx', 'json', xlsxToJson, ['jsonIndent', 'xlsxSheets']);

// --- Documents ------------------------------------------------------------------
// HTML input and MD → EPUB need the DOM (see worker-pool.ts for why they
// stay on the main thread); everything else here is DOM-free.

add('md', 'html', mdToHtml);
add('md', 'pdf', mdToPdf);
add('md', 'epub', mdToEpub, [], 'main');
add('html', 'md', htmlToMd, [], 'main');
add('html', 'txt', htmlToTxt, [], 'main');
add('html', 'pdf', htmlToPdf, [], 'main');
add('html', 'epub', htmlToEpub, [], 'main');
add('txt', 'html', txtToHtml);
add('txt', 'md', txtToMd);
add('txt', 'pdf', txtToPdf);
add('txt', 'epub', txtToEpub);

// --- PDF input ---------------------------------------------------------------------

for (const to of ['png', 'jpg', 'webp']) {
  add('pdf', to, pdfToImage, ['pdfPages', 'pdfScale', ...imageSettings(to)]);
}
add('pdf', 'txt', pdfToText);
add('pdf', 'html', pdfToHtml);
// PDF tools: pick/reorder/rotate/split pages and compress (pdf-lib, + PDFium
// to render when compressing); every image format onto a page. Merging
// several files is a batch action (mergePdf), not a route.
add('pdf', 'pdf', editPdf, ['pdfEdit', 'pdfCompress']);
for (const from of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'heic', 'avif', 'jxl']) {
  add(from, 'pdf', imageToPdf, ['pdfPageSize']);
}

// --- Queries -------------------------------------------------------------------------

/** Targets per source, in registry order (the first is the default choice). */
export const CONVERSION_MAP: Record<string, string[]> = {};
for (const route of ROUTES) (CONVERSION_MAP[route.from] ??= []).push(route.to);

export function findRoute(sourceExt: string, targetExt: string): Route | undefined {
  return byPair.get(`${sourceExt.toLowerCase()}:${targetExt.toLowerCase()}`);
}

export function getTargetFormats(sourceExt: string): string[] {
  return CONVERSION_MAP[sourceExt.toLowerCase()] ?? [];
}

/** The settings groups the panel shows for this pair (none: no gear icon). */
export function settingsFor(sourceExt: string, targetExt: string | null): SettingKey[] {
  return targetExt ? (findRoute(sourceExt, targetExt)?.settings ?? []) : [];
}

export function allRoutes(): readonly Route[] {
  return ROUTES;
}

export async function convertFile(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const sourceExt = getFileExtension(file.name);
  const route = findRoute(sourceExt, targetExt);
  if (!route) {
    throw new ConversionError('unsupported', `Unsupported conversion: ${sourceExt} → ${targetExt}`);
  }
  return route.run(file, sourceExt, targetExt, settings, onProgress);
}
