import { encodeIcoBlob } from 'ico-codec';
import type { ConversionSettings } from './types';
import { ASSET_BASE, decodeToImageData, encodeImageData, encodePngBytes } from './image-encode';

export { IMAGE_MIME_MAP } from './image-encode';

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

// SVG `<text>` needs a real font or resvg renders missing glyphs. Bundle Noto
// Sans (OFL) under public/fonts/ and pass its bytes via resvg's `fontBuffers`;
// system fonts stay off (the wasm sandbox can't read them). Fetched once per
// page load and cached. Hosted at a literal /fonts/ path (served by the static
// export from public/fonts/); operators who move wasm off-origin via
// NEXT_PUBLIC_ASSET_BASE must also serve /fonts/ (e.g. from the same CDN).
let defaultFontBytes: Promise<Uint8Array> | null = null;
function loadDefaultFont(): Promise<Uint8Array> {
  if (!defaultFontBytes) {
    defaultFontBytes = fetch('/fonts/noto-sans-regular.ttf')
      .then((r) => r.arrayBuffer())
      .then((b) => new Uint8Array(b));
  }
  return defaultFontBytes;
}

// Default render width for SVGs that declare neither intrinsic width/height nor
// a viewBox. resvg resolves a viewBox to dimensions natively, so the fallback is
// only needed for the rare size-less SVG.
const DEFAULT_SVG_WIDTH = 1024;

async function resvgFontOptions() {
  return { fontBuffers: [await loadDefaultFont()], defaultFontFamily: 'Noto Sans' };
}

// Renders SVG source via resvg (Rust→wasm) to an ImageData, independent of the
// browser's SVG engine. Replaces the old <img>+canvas rasterization, which had
// inconsistent output, no foreignObject support, and no real font loading.
async function renderSvgToImageData(svgText: string): Promise<ImageData> {
  const { Resvg } = await loadResvg();
  await ensureResvg();
  const font = await resvgFontOptions();
  let resvg = new Resvg(svgText, { font });
  try {
    if (resvg.width <= 0 || resvg.height <= 0) {
      resvg.free();
      resvg = new Resvg(svgText, { font, fitTo: { mode: 'width', value: DEFAULT_SVG_WIDTH } });
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

export async function convertImage(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  const imageData =
    sourceExt === 'svg'
      ? await renderSvgToImageData(await file.text())
      : await decodeToImageData(file);

  if (targetExt === 'ico') {
    const pngBuffer = await encodePngBytes(imageData);
    return encodeIcoBlob([{ size: Math.min(imageData.width, 256), data: pngBuffer }]);
  }

  return encodeImageData(imageData, targetExt, quality);
}
