// Image → text by OCR. Every source is decoded here (EXIF orientation
// applied, transparency flattened onto white) and handed to tesseract as BMP,
// which is instant to write and which its decoder reads directly.

import type { ConversionSettings } from './types';
import { encodeImageData } from './image-encode';
import { decodeAnyImage } from './image-converters';
import { recognize } from './ocr';

export async function imageToText(
  file: File,
  sourceExt: string,
  _targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const bmp = await encodeImageData(await decodeAnyImage(file, sourceExt), 'bmp', 1);
  onProgress?.(10);
  const text = await recognize(bmp, settings?.ocrLanguage ?? 'eng', (f) =>
    onProgress?.(Math.round(10 + f * 85)),
  );
  onProgress?.(100);
  return new Blob([tidy(text)], { type: 'text/plain;charset=utf-8' });
}

/** tesseract's text: trailing spaces off, runs of blank lines down to one. */
export function tidy(text: string): string {
  return (
    text
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}
