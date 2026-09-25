import type { ConversionSettings } from './types';
import { withMetadata } from './image-converters';
import { finishImage } from './image-encode';

// A HEIC can hold several top-level images (bursts, sequences, a photo
// with its edits). By default the primary one is converted, the image a
// photo viewer shows, which isn't always the first in the file. With
// heicAllImages, every image is converted and zipped, primary first.

interface HeifImage {
  handle: number;
  get_width(): number;
  get_height(): number;
  display(target: ImageData, done: (result: ImageData | null) => void): void;
}

async function decodeHeic(file: Blob, all: boolean): Promise<ImageData[]> {
  const libheif = (await import('libheif-js')).default;
  const data = new Uint8Array(await file.arrayBuffer());
  const decoder = new libheif.HeifDecoder();

  let images: HeifImage[];
  try {
    images = decoder.decode(data);
  } catch (err) {
    throw new Error(`HEIC decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
  if (!images.length) throw new Error('HEIC decode failed: no images in HEIC file');

  // HeifImage.is_primary() in libheif-js 1.19 calls an unbound global and
  // throws, so ask the module directly.
  const isPrimary = (image: HeifImage) => {
    try {
      return !!libheif.heif_image_handle_is_primary_image(image.handle);
    } catch {
      return false;
    }
  };
  const primary = Math.max(0, images.findIndex(isPrimary));
  const ordered = [images[primary], ...images.filter((_, i) => i !== primary)];

  const out: ImageData[] = [];
  for (const image of all ? ordered : ordered.slice(0, 1)) {
    // libheif renders straight into an ImageData buffer; the encode helper
    // flattens it to white for opaque targets (jpg/bmp).
    const imageData = new ImageData(image.get_width(), image.get_height());
    const rendered = await new Promise<ImageData | null>((resolve) =>
      image.display(imageData, resolve),
    );
    if (!rendered) throw new Error('HEIC decode failed: an image would not decode');
    out.push(rendered);
  }
  return out;
}

/** Decodes the primary image of a HEIC file. */
export async function decodeHeicToImageData(file: Blob): Promise<ImageData> {
  return (await decodeHeic(file, false))[0];
}

export default async function convertHeic(
  file: File,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const images = await decodeHeic(file, settings?.heicAllImages ?? false);
  if (images.length === 1) {
    const blob = await finishImage(images[0], targetExt, settings, onProgress);
    return withMetadata(file, 'heic', blob, targetExt, settings);
  }
  const base = file.name.replace(/\.[^.]+$/, '');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const [i, imageData] of images.entries()) {
    const blob = await finishImage(imageData, targetExt, settings);
    zip.file(
      `${base}-${i + 1}.${targetExt}`,
      await withMetadata(file, 'heic', blob, targetExt, settings),
    );
    onProgress?.(Math.round(((i + 1) / images.length) * 100));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}
