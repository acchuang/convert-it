export type FileCategory = 'image' | 'document' | 'data' | 'video' | 'audio';

export interface FormatInfo {
  ext: string;
  label: string;
  mimeType: string;
  category: FileCategory;
}

export interface ConversionSettings {
  quality: number; // 0–1, for jpg/webp image output (default 0.92)
  jsonIndent: number; // 0 | 2 | 4 (0 = minified)
  csvDelimiter: string; // ',' | ';' | '|' | '\t'
  xmlRootElement: string; // root element name for json→xml, csv→xml
  // Audio/Video settings
  audioBitrate: number; // 64 | 128 | 192 | 256 | 320 (kbps)
  videoQuality: number; // 0-51, lower is better quality (CRF)
  videoPreset: string; // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
  videoMaxWidth: number; // video→video: downscale to at most this width in px; 0 = keep
  mute: boolean; // video→video: drop the audio track
  trimStart: number; // seconds into the source; 0 = from the start
  trimEnd: number; // seconds into the source; 0 (or ≤ trimStart) = to the end
  cutStart: number; // seconds into the source: a section to remove from the middle…
  cutEnd: number; // …up to here; 0 (or ≤ cutStart) = no cut
  subtitleFile: File | null; // video output: an .srt/.vtt to burn into the picture
  animFps: number; // video → GIF / animated WebP frame rate
  animWidth: number; // video → GIF / animated WebP max width in px; 0 = source width
  // PDF input settings
  heicAllImages: boolean; // heic→image: every image in the file (zip, primary first) vs the primary one
  pdfAllPages: boolean; // pdf→image: render all pages (zip) vs page 1 (single image)
  pdfScale: number; // pdf→image render scale (1 | 2 | 3)
  // PDF tools
  pdfPageRange: string; // pdf→pdf pages in output order, e.g. "1-3, 5, 8-"; '' = all
  pdfRotate: number; // pdf→pdf clockwise rotation added to every page: 0 | 90 | 180 | 270
  pdfSplit: boolean; // pdf→pdf: one PDF per page (zip) instead of one PDF
  pdfCompress: string; // pdf→pdf: 'off' | 'medium' | 'strong' (re-render pages as JPEG)
  pdfPageSize: string; // image→pdf and merge: 'a4' | 'letter' | 'fit' (page = image)
  // Spreadsheet input
  xlsxAllSheets: boolean; // xlsx→csv: zip of one CSV per sheet; xlsx→json: object keyed by sheet name
  // Image toolbox — applied to any image output before encoding
  imageCropAspect: string; // 'none' | '1:1' | '4:3' | '16:9' | '3:2' (centre crop)
  imageResizePercent: number; // 100 = original; ignored when a width/height is set
  imageResizeWidth: number; // 0 = derive from height, or from the percent
  imageResizeHeight: number; // 0 = derive from width, or from the percent
  imageMaxSide: number; // 0 = off; otherwise the longest side is shrunk to at most this (never enlarged)
  imageTargetSizeKb: number; // 0 = off; jpg/webp only — quality is searched to fit
  metadata: string; // image output: 'strip' (default) | 'keep' | 'keep-no-gps'
  ocrLanguage: string; // image → text, and scanned pages in PDF → text: a tesseract code ('eng')
  subtitleOffset: number; // seconds added to every subtitle cue (negative = earlier)
}

export const DEFAULT_SETTINGS: ConversionSettings = {
  quality: 0.92,
  jsonIndent: 2,
  csvDelimiter: ',',
  xmlRootElement: 'root',
  audioBitrate: 192,
  videoQuality: 23,
  videoPreset: 'medium',
  videoMaxWidth: 0,
  mute: false,
  trimStart: 0,
  trimEnd: 0,
  cutStart: 0,
  cutEnd: 0,
  subtitleFile: null,
  animFps: 12,
  animWidth: 480,
  heicAllImages: false,
  pdfAllPages: false,
  pdfScale: 1,
  pdfPageRange: '',
  pdfRotate: 0,
  pdfSplit: false,
  pdfCompress: 'off',
  pdfPageSize: 'a4',
  xlsxAllSheets: false,
  imageCropAspect: 'none',
  imageResizePercent: 100,
  imageResizeWidth: 0,
  imageResizeHeight: 0,
  imageMaxSide: 0,
  imageTargetSizeKb: 0,
  metadata: 'strip',
  ocrLanguage: 'eng',
  subtitleOffset: 0,
};

export interface HistoryEntry {
  id: string;
  filename: string;
  sourceExt: string;
  targetExt: string;
  convertedAt: string; // ISO date
  fileSize: number;
  resultSize: number;
}

export type ConverterFn = (
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
) => Promise<Blob>;

// Single-threaded ffmpeg.wasm keeps the input, the output and its working memory
// in one wasm32 heap, so anything approaching 2GB kills the tab rather than erroring.
// These ceilings are deliberately conservative — raise them only against measurements.
export const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 100 * 1024 * 1024, // 100MB
  video: 500 * 1024 * 1024, // 500MB
  audio: 200 * 1024 * 1024, // 200MB
  document: 50 * 1024 * 1024, // 50MB
  data: 100 * 1024 * 1024, // 100MB
};
