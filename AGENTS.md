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
- Serve the export as Pages would (applies `out/_headers`): `npm run serve`
- Browser smoke suite (real codecs, CSP violations fail it): `npm run fixtures`, `npm run serve`, then `npm run smoke`. Set `SMOKE_CHROMIUM_PATH` if Google Chrome isn't installed.
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
- PDF input (PDF → PNG/JPG/WebP, PDF → TXT/HTML) uses `@hyzyla/pdfium` (MIT wrapper over BSD-3 PDFium; not AGPL mupdf). Page render → RGBA → existing `encodeImageData` pipeline. Text extraction is layout-naive (reading order, no OCR).
- PDF → image defaults to page 1 as a single image. With `ConversionSettings.pdfAllPages` it renders every page at `pdfScale` (1×/2×/3×) and returns a `application/zip` Blob (one `<base>-page-<n>.<ext>` per page via jszip); `downloadJob` names zip outputs `.zip` and `JobCard.canPreview` skips zip blobs. Default (`pdfAllPages=false`) keeps the single-page behaviour.

## Text & Markup Output

- Any converter that writes XML or HTML by hand goes through `lib/markup.ts` (`escapeXml`/`escapeHtml`, `xmlName` for keys → legal element names, `rowsToXml`, `rowsToHtmlTable`). Never interpolate cell values or keys raw.
- HTML → text (htmlToTxt, md/html → PDF) goes through `lib/html-text.ts` `htmlToPlainText`: `DOMParser` (inert — never `innerHTML` on a live-document element, which runs `onerror` handlers), drops script/style, keeps block line breaks.
- Text → PDF lays out one source line at a time (`textToPdfBlob`); don't round-trip through HTML `textContent`, which loses every line break.

## Media (FFmpeg)

- Command lines come from the pure `buildFfmpegArgs` in `lib/audio-video-converters.ts` — one entry per container in `VIDEO_CONTAINERS` pairing a video codec with an audio codec that muxer accepts. Unit-test args there; don't build them inline.
- WebM is VP8 + Vorbis. In `@ffmpeg/core` 0.12.10 `libvpx-vp9` crashes ("memory access out of bounds") on every input and `libopus` on any stereo source; re-test both in a browser (the smoke suite's mkv → webm pair) before switching after a core upgrade.
- Every exec checks its exit code and deletes its MEMFS files in `finally`. A failed core load is not cached; the next job retries.

## Security Headers (CSP)

- `npm run build` runs `postbuild` → `scripts/security-headers.mjs`, which writes `out/_headers` (site-wide CSP, framing, nosniff, referrer, caching) and injects a per-page `<meta>` CSP listing the SHA-256 of that page's inline scripts. Both are enforced; inline script runs only if hashed. Never hand-edit `out/`.
- `connect-src` is `'self'` plus the `NEXT_PUBLIC_FFMPEG_BASE_URL` (and a non-relative `NEXT_PUBLIC_ASSET_BASE`) origin. A new runtime fetch to any other origin needs a change there, and the smoke suite fails on any CSP violation.
- The FFmpeg core is fetched, checked against `FFMPEG_CORE_SHA256` in `lib/audio-video-converters.ts`, and loaded from a `blob:` URL (hence `blob:` in the header `script-src`, which only workers get alone). Upgrading `@ffmpeg/core` means uploading the new files to R2 and updating both hashes.

## Spreadsheets

- XLSX read/write is in-house: `lib/xlsx.ts` on jszip + fast-xml-parser. Do not re-add the npm `xlsx` (SheetJS) package — it is frozen at 0.18.5 with unfixed prototype-pollution and ReDoS advisories.
- Reader decodes shared/inline/rich strings, numbers (15 significant digits, like Excel), booleans, errors, formula results and dates (from the cell's number format, 1900 and 1904 systems). Writer emits one plain sheet. `lib/__tests__/fixtures/sheetjs-*.xlsx` pin the reader against a third-party producer.

## Webpack

- `next.config.ts` disables URL-asset parsing (`parser: { url: false }`) inside `@jsquash/*` and `@hyzyla/pdfium` only, to stop their emscripten/wasm-bindgen `new URL('...wasm', import.meta.url)` glue from emitting dead duplicate `.wasm` under `_next/static/media/`. Extend the `include` regex if another wasm vendor is added with the same pattern.

## Child DOX Index

| Path   | Purpose                             |
| ------ | ----------------------------------- |
| `lib/` | Core conversion logic and utilities |
