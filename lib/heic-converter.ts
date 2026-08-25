import type { ConversionSettings } from './types';
import { finishImage } from './image-encode';

export default async function convertHeic(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
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

  // libheif renders straight into an ImageData buffer; pass it directly to the
  // encode helper, which flattens to white for opaque targets (jpg/bmp).
  const imageData = new ImageData(width, height);
  await image.display(imageData, () => {});

  return finishImage(imageData, targetExt, settings, onProgress);
}
