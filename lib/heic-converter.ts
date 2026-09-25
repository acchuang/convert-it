import type { ConversionSettings } from './types';
import { withMetadata } from './image-converters';
import { finishImage } from './image-encode';

/** Decodes the first image of a HEIC file. */
export async function decodeHeicToImageData(file: Blob): Promise<ImageData> {
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

  // libheif renders straight into an ImageData buffer; the encode helper
  // flattens it to white for opaque targets (jpg/bmp).
  const imageData = new ImageData(image.get_width(), image.get_height());
  await image.display(imageData, () => {});
  return imageData;
}

export default async function convertHeic(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const blob = await finishImage(
    await decodeHeicToImageData(file),
    targetExt,
    settings,
    onProgress,
  );
  return withMetadata(file, 'heic', blob, targetExt, settings);
}
