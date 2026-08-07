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
const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? '/wasm';

export const IMAGE_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const FLATTEN_EXTS = new Set(['jpg', 'jpeg', 'bmp']);

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

// Encodes ImageData to a Blob using jSquash WASM codecs for jpg/png/webp and
// canvas.toBlob (the only available encoder) for BMP, which has no jSquash codec.
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

  // BMP (and anything unmapped): no WASM codec — fall back to the browser.
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(input, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      mime,
      quality,
    );
  });
}

// PNG bytes for ICO embedding. ico-codec wraps PNG-encoded frames in an ICO
// container, so we encode the frame to PNG via jSquash and hand the raw bytes over.
export async function encodePngBytes(imageData: ImageData): Promise<Uint8Array> {
  await ensurePng();
  const buffer = await encodePng(imageData);
  const optimised = await optimisePngBytes(buffer);
  return new Uint8Array(optimised);
}
