// Copies the jSquash WASM codec binaries out of node_modules into public/wasm/
// so the static export serves them at ${NEXT_PUBLIC_ASSET_BASE}/<file> and the
// codecs lazy-fetch them at runtime instead of bundling the bytes into JS.
//
// Run after installing/upgrading @jsquash/*: `npm run copy-wasm`.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(root, 'public/wasm');

const sources = [
  ['@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', 'mozjpeg_enc.wasm'],
  ['@jsquash/png/codec/pkg/squoosh_png_bg.wasm', 'squoosh_png_bg.wasm'],
  ['@jsquash/webp/codec/enc/webp_enc.wasm', 'webp_enc.wasm'],
  ['@jsquash/webp/codec/enc/webp_enc_simd.wasm', 'webp_enc_simd.wasm'],
  // Single-threaded builds only. The site is cross-origin isolated, so these
  // codecs' entry points would pick their multi-threaded builds, which need
  // pthread worker scripts we don't ship; lib/image-encode.ts imports each
  // single-threaded glue directly instead.
  ['@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm', 'squoosh_oxipng_bg.wasm'],
  ['@jsquash/avif/codec/enc/avif_enc.wasm', 'avif_enc.wasm'],
  ['@jsquash/jxl/codec/enc/jxl_enc.wasm', 'jxl_enc.wasm'],
  ['@jsquash/jxl/codec/dec/jxl_dec.wasm', 'jxl_dec.wasm'],
  // resvg ships a generically-named index_bg.wasm; rename to avoid clashes.
  ['@resvg/resvg-wasm/index_bg.wasm', 'resvg_bg.wasm'],
  // PDFium (via @hyzyla/pdfium) for PDF-as-input rendering/text extraction.
  ['@hyzyla/pdfium/dist/pdfium.wasm', 'pdfium.wasm'],
];

await mkdir(dest, { recursive: true });

for (const [rel, name] of sources) {
  const from = resolve(root, 'node_modules', rel);
  const to = resolve(dest, name);
  if (!existsSync(from)) {
    throw new Error(`Missing ${from} — run \`npm install\` first.`);
  }
  await cp(from, to);
  console.log(`copied ${rel} -> public/wasm/${name}`);
}
