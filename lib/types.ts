export type FileCategory = 'image' | 'document' | 'data';

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
}

export const DEFAULT_SETTINGS: ConversionSettings = {
  quality: 0.92,
  jsonIndent: 2,
  csvDelimiter: ',',
  xmlRootElement: 'root',
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
  settings?: ConversionSettings
) => Promise<Blob>;
