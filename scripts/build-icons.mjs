// Renders the PNG app icons from public/favicon.svg with resvg (the same wasm
// the app uses for SVG → PNG). Run after changing the favicon:
//
//   node scripts/build-icons.mjs
//
// Why PNGs: Android's install prompt needs 192 and 512 px PNGs plus a
// "maskable" one (launchers crop it to a circle or squircle), and iOS ignores
// SVG apple-touch-icons entirely.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const root = process.cwd();
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

await initWasm(readFileSync(join(root, 'public', 'wasm', 'resvg_bg.wasm')));
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');

function render(source, size) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  return png;
}

// "any" icons: the favicon as drawn (rounded square on transparent).
for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(out, name), render(svg, size));
}

// Maskable: full-bleed background, artwork inside the 80% safe zone so a
// circular crop never clips the arrows.
const inner = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0A0A0A"/>
  <g transform="translate(15 15) scale(0.7)">${inner}</g>
</svg>`;
writeFileSync(join(out, 'maskable-512.png'), render(maskable, 512));

console.log('icons written to public/icons/');
