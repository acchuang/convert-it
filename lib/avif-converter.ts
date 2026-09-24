import type { ConversionSettings } from './types';
import { withMetadata } from './image-converters';
import { bitmapToImageData, finishImage } from './image-encode';

export default async function convertAvif(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(`AVIF decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  try {
    const imageData = bitmapToImageData(bitmap);
    const blob = await finishImage(imageData, targetExt, settings, onProgress);
    return await withMetadata(file, 'avif', blob, targetExt, settings);
  } finally {
    bitmap.close();
  }
}
