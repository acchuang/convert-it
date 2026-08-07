import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { encodeImageData, encodePngBytes } from './image-encode';

// Draws the decoded bitmap to a canvas and reads the pixels once; the shared
// encode helper dispatches to jSquash (jpg/png/webp) or canvas (bmp).
function drawToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

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
    const imageData = drawToImageData(bitmap);

    if (targetExt === 'ico') {
      const pngBuffer = await encodePngBytes(imageData);
      return encodeIcoBlob([{ size: Math.min(bitmap.width, 256), data: pngBuffer }]);
    }

    return encodeImageData(imageData, targetExt, quality);
  } finally {
    bitmap.close();
  }
}
