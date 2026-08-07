import { encodeIcoBlob } from 'ico-codec';
import type { ConversionSettings } from './types';
import { ASSET_BASE, encodeImageData, encodePngBytes } from './image-encode';

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

// resvg's JS glue is small but the wasm is ~2.4 MB, so both load lazily: the
// module is dynamically imported only when an SVG is actually converted (non-SVG
// image conversions never touch it), and initWasm (one-shot, throws if called
// twice) is guarded so it runs exactly once.
let resvgModule: Promise<typeof import('@resvg/resvg-wasm')> | null = null;
let resvgReady: Promise<void> | null = null;
function loadResvg(): Promise<typeof import('@resvg/resvg-wasm')> {
  if (!resvgModule) resvgModule = import('@resvg/resvg-wasm');
  return resvgModule;
}
function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    resvgReady = loadResvg().then(({ initWasm }) => initWasm(`${ASSET_BASE}/resvg_bg.wasm`));
  }
  return resvgReady;
}

// Default render width for SVGs that declare neither intrinsic width/height nor
// a viewBox. resvg resolves a viewBox to dimensions natively, so the fallback is
// only needed for the rare size-less SVG.
const DEFAULT_SVG_WIDTH = 1024;

// Renders SVG source via resvg (Rust→wasm) to an ImageData, independent of the
// browser's SVG engine. Replaces the old <img>+canvas rasterization, which had
// inconsistent output, no foreignObject support, and no real font loading.
async function renderSvgToImageData(svgText: string): Promise<ImageData> {
  const { Resvg } = await loadResvg();
  await ensureResvg();
  let resvg = new Resvg(svgText, { font: { loadSystemFonts: false } });
  try {
    if (resvg.width <= 0 || resvg.height <= 0) {
      resvg.free();
      resvg = new Resvg(svgText, {
        font: { loadSystemFonts: false },
        fitTo: { mode: 'width', value: DEFAULT_SVG_WIDTH },
      });
    }
    const rendered = resvg.render();
    try {
      return new ImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height);
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}

// Draws a raster source to a canvas and reads the pixels exactly once; the
// shared encode helper dispatches to the right codec (jSquash for jpg/png/webp,
// canvas for bmp) and handles white-flattening for opaque formats.
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

  let imageData: ImageData;
  if (sourceExt === 'svg') {
    imageData = await renderSvgToImageData(await file.text());
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      imageData = drawToImageData(img, img.naturalWidth, img.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (targetExt === 'ico') {
    const pngBuffer = await encodePngBytes(imageData);
    return encodeIcoBlob([{ size: Math.min(imageData.width, 256), data: pngBuffer }]);
  }

  return encodeImageData(imageData, targetExt, quality);
}
