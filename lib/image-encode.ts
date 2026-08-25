import encodeJpeg, { init as initJpeg } from '@jsquash/jpeg/encode';
import encodePng, { init as initPng } from '@jsquash/png/encode';
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode';
import optimiseOxipng, { init as initOxipng } from '@jsquash/oxipng/optimise';

// jSquash ships its .wasm beside its JS in node_modules. We copy those files
// into public/wasm/ (see scripts/copy-wasm.mjs) and point each codec at them via
// locateFile / an explicit init URL, so the wasm is lazy-fetched at runtime and
// never inlined into the JS bundle. Override the base with this env var when
// hosting the assets elsewhere (e.g. a CDN); default '/wasm' serves them from
// the static export's public/ directory.
export const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? '/wasm';

export const IMAGE_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const FLATTEN_EXTS = new Set(['jpg', 'jpeg', 'bmp']);

// Decoding goes through createImageBitmap + OffscreenCanvas rather than
// `new Image()` + a DOM canvas: same browser decoders, no object-URL round
// trip, and — the reason it matters — both exist inside a Web Worker, so the
// whole image path can run off the main thread.
export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export async function decodeToImageData(source: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(source);
  try {
    return bitmapToImageData(bitmap);
  } finally {
    bitmap.close();
  }
}

// BMP has no jSquash codec, and canvas.toBlob('image/bmp') is not a thing —
// the spec tells the browser to silently emit PNG for any unsupported type, so
// the old fallback wrote PNG bytes into a .bmp file. Uncompressed 24-bit BGR
// bottom-up is a handful of lines and is what every BMP reader accepts.
// Callers flatten alpha first (bmp is in FLATTEN_EXTS), so alpha is dropped.
export function encodeBmp(imageData: ImageData): Uint8Array<ArrayBuffer> {
  const { width, height, data } = imageData;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = new ArrayBuffer(14 + 40 + pixelBytes);
  const out = new Uint8Array(buffer);
  const view = new DataView(buffer);

  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true); // pixel data offset
  view.setUint32(14, 40, true); // DIB header size
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true); // 72 DPI
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y++) {
    // BMP rows run bottom-up.
    let out_i = 54 + (height - 1 - y) * rowSize;
    let src = y * width * 4;
    for (let x = 0; x < width; x++) {
      out[out_i++] = data[src + 2];
      out[out_i++] = data[src + 1];
      out[out_i++] = data[src];
      src += 4;
    }
  }
  return out;
}

// Each codec initialises once and is reused. jSquash's emscripten glue
// (jpeg/webp) resolves the wasm through locateFile; the png and oxipng codecs
// (wasm-bindgen) take the wasm URL directly. All fetch lazily on first use.
let jpegReady: Promise<void> | null = null;
let pngReady: Promise<unknown> | null = null;
let webpReady: Promise<unknown> | null = null;
let oxipngReady: Promise<unknown> | null = null;

function ensureJpeg(): Promise<void> {
  if (!jpegReady) {
    jpegReady = initJpeg({ locateFile: (path: string) => `${ASSET_BASE}/${path}` });
  }
  return jpegReady;
}

function ensurePng(): Promise<unknown> {
  if (!pngReady) {
    pngReady = initPng(`${ASSET_BASE}/squoosh_png_bg.wasm`);
  }
  return pngReady;
}

function ensureWebp(): Promise<unknown> {
  if (!webpReady) {
    webpReady = initWebp({ locateFile: (path: string) => `${ASSET_BASE}/${path}` });
  }
  return webpReady;
}

function ensureOxipng(): Promise<unknown> {
  if (!oxipngReady) {
    oxipngReady = initOxipng(`${ASSET_BASE}/squoosh_oxipng_bg.wasm`);
  }
  return oxipngReady;
}

// Lossless PNG optimisation post-pass via oxipng (level 2 — the codec's default).
// Runs after the libpng encode so standalone PNG and ICO inner-PNG output are
// smaller without any quality loss.
async function optimisePngBytes(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  await ensureOxipng();
  return optimiseOxipng(buffer);
}

// JPEG and BMP have no alpha channel. canvas.toBlob composites transparent
// pixels over the page/canvas background; jSquash encodes the raw bytes, so we
// pre-composite over white ourselves to match the previous (white-fill) output.
function flattenOverWhite(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const inv = 1 - a;
    out[i] = data[i] * a + 255 * inv;
    out[i + 1] = data[i + 1] * a + 255 * inv;
    out[i + 2] = data[i + 2] * a + 255 * inv;
    out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

// Encodes ImageData to a Blob using jSquash WASM codecs for jpg/png/webp and a
// small hand-rolled encoder for BMP, which has no jSquash codec.
// `quality` is the app's 0–1 value; it is mapped to each codec's 0–100 scale.
export async function encodeImageData(
  imageData: ImageData,
  targetExt: string,
  quality: number,
): Promise<Blob> {
  const ext = targetExt.toLowerCase();
  const mime = IMAGE_MIME_MAP[ext] ?? 'image/png';
  const input = FLATTEN_EXTS.has(ext) ? flattenOverWhite(imageData) : imageData;

  if (ext === 'jpg' || ext === 'jpeg') {
    await ensureJpeg();
    const buffer = await encodeJpeg(input, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: mime });
  }
  if (ext === 'png') {
    await ensurePng();
    const buffer = await encodePng(input);
    const optimised = await optimisePngBytes(buffer);
    return new Blob([optimised], { type: mime });
  }
  if (ext === 'webp') {
    await ensureWebp();
    const buffer = await encodeWebp(input, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: mime });
  }

  if (ext === 'bmp') {
    return new Blob([encodeBmp(input)], { type: mime });
  }

  throw new Error(`No encoder for .${ext}`);
}

// PNG bytes for ICO embedding. ico-codec wraps PNG-encoded frames in an ICO
// container, so we encode the frame to PNG via jSquash and hand the raw bytes over.
export async function encodePngBytes(imageData: ImageData): Promise<Uint8Array> {
  await ensurePng();
  const buffer = await encodePng(imageData);
  const optimised = await optimisePngBytes(buffer);
  return new Uint8Array(optimised);
}
