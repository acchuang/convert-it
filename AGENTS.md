# convert-it

## Purpose

File conversion web app. Next.js static export, no backend — every conversion runs in the browser.

## Ownership

Independent Next.js project deployed via Cloudflare Pages.

## Local Contracts

- Next.js v15+, `type: "module"`. App Router, `output: 'export'`.
- No server code. There is no `functions/` directory and no KV binding — keep it that way.
- Core conversion logic in `lib/`.
- i18n support via `locales/`.
- ESLint + Prettier configured. Vitest for tests.

## Work Guidance

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npx eslint .`
- Format: `npx prettier --check .`
- Test: `npx vitest run`
- Type-check: `npx tsc --noEmit`
- Sync wasm assets: `npm run copy-wasm` (run after install or upgrading `@jsquash/*`, `@resvg/resvg-wasm`, or `@hyzyla/pdfium`; copies all codec/library `.wasm` files from `node_modules` into `public/wasm/`). Files are committed, not gitignored.

## Image Encode (WASM)

- Image output (JPEG/PNG/WebP) is encoded via `@jsquash/*` WASM codecs (mozjpeg/libpng/libwebp), not `canvas.toBlob`. Shared helper: `lib/image-encode.ts`.
- PNG (and the inner PNG of ICO) is losslessly optimized by `@jsquash/oxipng` (Rust) as a post-pass.
- SVG source is rasterized via `@resvg/resvg-wasm` (Rust resvg) in `lib/image-converters.ts`, not `<img>`+canvas (fixes fonts/foreignObject/browser variance). SVG `<text>` renders real glyphs via a bundled Noto Sans (OFL) font at `public/fonts/noto-sans-regular.ttf`, passed to resvg through `font.fontBuffers` (system fonts stay off).
- BMP output keeps `canvas.toBlob` (no jSquash codec). ICO output uses `ico-codec` over PNG bytes from `@jsquash/png`.
- Decode stays native: `createImageBitmap` (AVIF), `HTMLImageElement` (raster), `libheif-js` (HEIC).
- Codec `.wasm` files live under `public/wasm/` and are lazy-fetched at runtime via `NEXT_PUBLIC_ASSET_BASE` (default `/wasm`), mirroring the `NEXT_PUBLIC_FFMPEG_BASE_URL` + R2 pattern used for FFmpeg core. They are small enough to ship from the static export, not R2.

## PDF

- PDF output (txt/md/html/json → PDF) uses `jspdf` (pure JS) in `lib/pdf-converters.ts`.
- PDF input (PDF → PNG/JPG/WebP page 1, PDF → TXT/HTML all pages) uses `@hyzyla/pdfium` (MIT wrapper over BSD-3 PDFium; not AGPL mupdf). Page render → RGBA → existing `encodeImageData` pipeline. Text extraction is layout-naive (reading order, no OCR).
- MVP: page-1 image, all-page text. Multi-page image zip and a render-scale/DPI setting are open follow-ups.

## Webpack

- `next.config.ts` disables URL-asset parsing (`parser: { url: false }`) inside `@jsquash/*` and `@hyzyla/pdfium` only, to stop their emscripten/wasm-bindgen `new URL('...wasm', import.meta.url)` glue from emitting dead duplicate `.wasm` under `_next/static/media/`. Extend the `include` regex if another wasm vendor is added with the same pattern.

## Child DOX Index

| Path   | Purpose                             |
| ------ | ----------------------------------- |
| `lib/` | Core conversion logic and utilities |
