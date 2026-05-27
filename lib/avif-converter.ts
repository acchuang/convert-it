import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { IMAGE_MIME_MAP } from './image-converters';

function rasterizeBitmap(
  bitmap: ImageBitmap,
  targetExt: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;

  if (['jpg', 'jpeg', 'bmp'].includes(targetExt)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);

  const mimeType = IMAGE_MIME_MAP[targetExt] ?? 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      mimeType,
      quality
    );
  });
}

export default async function convertAvif(
  file: File,
  targetExt: string,
  settings?: ConversionSettings
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(`AVIF decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  if (targetExt === 'ico') {
    const pngBlob = await rasterizeBitmap(bitmap, 'png', 1);
    const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());
    const result = encodeIcoBlob([{ size: Math.min(bitmap.width, 256), data: pngBuffer }]);
    bitmap.close();
    return result;
  }

  const result = await rasterizeBitmap(bitmap, targetExt, quality);
  bitmap.close();
  return result;
}
