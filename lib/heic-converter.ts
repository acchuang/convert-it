import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { IMAGE_MIME_MAP } from './image-converters';

function rasterizeToTarget(
  source: HTMLImageElement,
  targetExt: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  if (['jpg', 'jpeg', 'bmp'].includes(targetExt)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0);

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

export default async function convertHeic(
  file: File,
  targetExt: string,
  settings?: ConversionSettings
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  const libheif = await import('libheif-js');
  const data = new Uint8Array(await file.arrayBuffer());
  const decoder = new libheif.default.HeifDecoder();

  let image: any;
  try {
    const images = decoder.decode(data);
    if (!images.length) throw new Error('no images in HEIC file');
    image = images[0];
  } catch (err) {
    throw new Error(`HEIC decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  const width = image.get_width();
  const height = image.get_height();

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d')!;
  const imageData = tempCtx.createImageData(width, height);
  await image.display(imageData, () => {});
  tempCtx.putImageData(imageData, 0, 0);

  const tempBlob = await new Promise<Blob>((resolve, reject) => {
    tempCanvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
  });

  const url = URL.createObjectURL(tempBlob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('temp image load failed'));
    el.src = url;
  });
  URL.revokeObjectURL(url);

  if (targetExt === 'ico') {
    const pngBlob = await rasterizeToTarget(img, 'png', 1);
    const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());
    return encodeIcoBlob([{ size: Math.min(width, 256), data: pngBuffer }]);
  }

  return rasterizeToTarget(img, targetExt, quality);
}
