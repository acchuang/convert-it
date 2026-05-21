export type FileCategory = 'image' | 'document' | 'data' | 'video' | 'audio';

export interface FormatInfo {
  ext: string;
  label: string;
  mimeType: string;
  category: FileCategory;
}

export interface ConversionSettings {
  quality: number;        // 0–1, for jpg/webp image output (default 0.92)
  jsonIndent: number;     // 0 | 2 | 4 (0 = minified)
  csvDelimiter: string;   // ',' | ';' | '|' | '\t'
  xmlRootElement: string; // root element name for json→xml, csv→xml
  // Audio/Video settings
  audioBitrate: number;   // 64 | 128 | 192 | 256 | 320 (kbps)
  videoQuality: number; // 0-51, lower is better quality (CRF)
  videoPreset: string;  // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
}

export const DEFAULT_SETTINGS: ConversionSettings = {
  quality: 0.92,
  jsonIndent: 2,
  csvDelimiter: ',',
  xmlRootElement: 'root',
  audioBitrate: 192,
  videoQuality: 23,
  videoPreset: 'medium',
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
  onProgress?: (pct: number) => void
) => Promise<Blob>;

export const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 100 * 1024 * 1024,    // 100MB
  video: 2 * 1024 * 1024 * 1024, // 2GB
  audio: 500 * 1024 * 1024,    // 500MB
  document: 50 * 1024 * 1024,  // 50MB
  data: 100 * 1024 * 1024,     // 100MB
};
