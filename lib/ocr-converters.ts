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
  const lang = settings?.ocrLanguage ?? 'eng';
  // Every page of a TIFF is read, in turn, a blank line between pages.
  const { count, pages } =
    sourceExt === 'tiff' || sourceExt === 'tif'
      ? await (await import('./tiff')).tiffPages(file)
      : { count: 1, pages: [await decodeAnyImage(file, sourceExt)] };
  const texts: string[] = [];
  for (const page of pages) {
    const done = texts.length;
    const bmp = await encodeImageData(page, 'bmp', 1);
    texts.push(
      tidy(
        await recognize(bmp, lang, (f) => onProgress?.(Math.round(10 + ((done + f) / count) * 85))),
      ),
    );
  }
  onProgress?.(100);
  return new Blob([texts.join('\n')], { type: 'text/plain;charset=utf-8' });
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
