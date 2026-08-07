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
