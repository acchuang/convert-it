import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { bitmapToImageData, encodeImageData, encodePngBytes } from './image-encode';

export default async function convertAvif(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(`AVIF decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  try {
    const imageData = bitmapToImageData(bitmap);

    if (targetExt === 'ico') {
      const pngBuffer = await encodePngBytes(imageData);
      return encodeIcoBlob([{ size: Math.min(bitmap.width, 256), data: pngBuffer }]);
    }

    return encodeImageData(imageData, targetExt, quality);
  } finally {
    bitmap.close();
  }
}
