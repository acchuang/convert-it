export type FileCategory = 'image' | 'document' | 'data';

export interface FormatInfo {
  ext: string;
  label: string;
  mimeType: string;
  category: FileCategory;
}

export type ConverterFn = (file: File, sourceExt: string, targetExt: string) => Promise<Blob>;