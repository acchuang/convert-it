// Copies the jSquash WASM codec binaries out of node_modules into public/wasm/
// so the static export serves them at ${NEXT_PUBLIC_ASSET_BASE}/<file> and the
// codecs lazy-fetch them at runtime instead of bundling the bytes into JS.
//
// Run after installing/upgrading @jsquash/*: `npm run copy-wasm`.
// `npm run copy-wasm -- --check` (CI) copies nothing: it fails if a committed
// file differs from its package's, is missing, or is left over from a
// package no longer used, so an upgrade can't ship with stale binaries.
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
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

// OCR (tesseract.js) under public/ocr: its worker, the two LSTM cores the app
// picks between (SIMD or not), and each language's tessdata 4.0.0 best_int.
const ocr = resolve(root, 'public/ocr');
const OCR_LANGUAGES = ['eng', 'spa', 'fra', 'deu', 'chi_sim', 'chi_tra', 'jpn', 'kor'];
sources.push(
  ['tesseract.js/dist/worker.min.js', '../ocr/worker.min.js'],
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm'].flatMap((core) => [
    [`tesseract.js-core/${core}.js`, `../ocr/${core}.js`],
    [`tesseract.js-core/${core}.wasm`, `../ocr/${core}.wasm`],
  ]),
  ...OCR_LANGUAGES.map((lang) => [
    `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `../ocr/lang/${lang}.traineddata.gz`,
  ]),
);

for (const [rel] of sources) {
  const from = resolve(root, 'node_modules', rel);
  if (!existsSync(from)) throw new Error(`Missing ${from} — run \`npm install\` first.`);
}

if (process.argv.includes('--check')) {
  const problems = [];
  const expected = new Set();
  for (const [rel, name] of sources) {
    const to = resolve(dest, name);
    expected.add(to);
    if (!existsSync(to)) {
      problems.push(`missing: public/wasm/${name} (from ${rel})`);
    } else if (!(await readFile(resolve(root, 'node_modules', rel))).equals(await readFile(to))) {
      problems.push(`differs from ${rel}: public/wasm/${name}`);
    }
  }
  for (const dir of [dest, ocr, resolve(ocr, 'lang')]) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isFile() && !expected.has(path)) {
        problems.push(`not from any package: ${path.slice(root.length + 1)}`);
      }
    }
  }
  if (problems.length) {
    console.error(`${problems.join('\n')}\n\nRun \`npm run copy-wasm\` and commit the result.`);
    process.exit(1);
  }
  console.log(`public/wasm and public/ocr match node_modules (${sources.length} files)`);
  process.exit(0);
}

await mkdir(resolve(ocr, 'lang'), { recursive: true });
await mkdir(dest, { recursive: true });

for (const [rel, name] of sources) {
  await cp(resolve(root, 'node_modules', rel), resolve(dest, name));
  console.log(`copied ${rel} -> public/wasm/${name}`);
}
