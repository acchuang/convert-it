import { encodeIcoBlob } from 'ico-codec';
import type { ConversionSettings } from './types';
import { encodeImageData, encodePngBytes } from './image-encode';

export { IMAGE_MIME_MAP } from './image-encode';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

async function svgToImage(svgText: string): Promise<HTMLImageElement> {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Draws the source to a canvas and reads the pixels exactly once; the shared
// encode helper dispatches to the right codec (jSquash for jpg/png/webp, canvas
// for bmp) and handles white-flattening for opaque formats.
function drawToImageData(source: HTMLImageElement, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export async function convertImage(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;
  const isSvg = sourceExt === 'svg';

  let img: HTMLImageElement;
  if (isSvg) {
    const svgText = await file.text();
    img = await svgToImage(svgText);
  } else {
    const url = URL.createObjectURL(file);
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  if (targetExt === 'ico') {
    const imageData = drawToImageData(img, width, height);
    const pngBuffer = await encodePngBytes(imageData);
    return encodeIcoBlob([{ size: Math.min(width, 256), data: pngBuffer }]);
  }

  const imageData = drawToImageData(img, width, height);
  return encodeImageData(imageData, targetExt, quality);
}
