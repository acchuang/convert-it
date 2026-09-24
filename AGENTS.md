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
- Test: `npx vitest run` (set `EPUBCHECK_JAR` to an epubcheck 5 jar to also validate EPUB output, as CI does)
- Type-check: `npx tsc --noEmit`
- Serve the export as Pages would (applies `out/_headers`): `npm run serve`
- Browser smoke suite (real codecs, CSP violations fail it): `npm run fixtures`, `npm run serve`, then `npm run smoke`; offline behaviour: `node scripts/offline-smoke.mjs`. Set `SMOKE_CHROMIUM_PATH` if Google Chrome isn't installed.
- Sync wasm assets: `npm run copy-wasm` (run after install or upgrading `@jsquash/*`, `@resvg/resvg-wasm`, or `@hyzyla/pdfium`; copies all codec/library `.wasm` files from `node_modules` into `public/wasm/`). Files are committed, not gitignored.

## Converter Registry

- `lib/converters.ts` is the one registry: each supported pair is a `Route` `{ from, to, run, thread, settings }` added with `add(...)`. `CONVERSION_MAP`, `findRoute`, `getTargetFormats`, `convertFile`, the worker pool's `runsOnMainThread` and the settings panel all read it. Adding a conversion is one `add` line; never special-case a pair elsewhere.
- `thread: 'main'` for anything that drives ffmpeg.wasm (it has its own worker) or needs the DOM (HTML input, MD → EPUB); everything else runs in the worker pool.
- `settings` lists the `SettingKey` groups the converter actually reads, in panel order; `SETTING_FIELDS` maps each to its `ConversionSettings` fields. `app/components/SettingsPanel.tsx` shows exactly `settingsFor(source, target)`, and the gear icon hides when it is empty. `lib/__tests__/registry.test.ts` records which fields each data/document converter reads and checks media args, so a declared-but-unused (or used-but-undeclared) setting fails; the `CONVERSION_MAP` snapshot pins the route list.
- Format metadata (`FORMATS`, `getFormatInfo`, `getFileExtension`, `formatFileSize`) and the single extension → MIME table `mimeFor` live in `lib/formats.ts`, which imports no converter. Don't add per-module MIME maps.

## Image Encode (WASM)

- Image output (JPEG/PNG/WebP) is encoded via `@jsquash/*` WASM codecs (mozjpeg/libpng/libwebp), not `canvas.toBlob`. Shared helper: `lib/image-encode.ts`.
- PNG (and the inner PNG of ICO) is losslessly optimized by `@jsquash/oxipng` (Rust) as a post-pass.
- SVG source is rasterized via `@resvg/resvg-wasm` (Rust resvg) in `lib/image-converters.ts`, not `<img>`+canvas (fixes fonts/foreignObject/browser variance). SVG `<text>` renders real glyphs via a bundled Noto Sans (OFL) font at `public/fonts/noto-sans-regular.ttf`, passed to resvg through `font.fontBuffers` (system fonts stay off).
- BMP output keeps `canvas.toBlob` (no jSquash codec). ICO output uses `ico-codec` over PNG bytes from `@jsquash/png`.
- Decode stays native: `createImageBitmap` (AVIF), `HTMLImageElement` (raster), `libheif-js` (HEIC).
- Codec `.wasm` files live under `public/wasm/` and are lazy-fetched at runtime via `NEXT_PUBLIC_ASSET_BASE` (default `/wasm`), mirroring the `NEXT_PUBLIC_FFMPEG_BASE_URL` + R2 pattern used for FFmpeg core. They are small enough to ship from the static export, not R2.

## PDF

- PDF output (txt/md/html/json → PDF) is typeset by `lib/pdf-layout.ts` (`renderPdf` over `Block`s of styled `Run`s) on `jspdf`. Markdown → blocks comes from `marked.lexer` in `lib/markdown-blocks.ts` (headings, bold/italic/code, links, nested lists, code blocks, quotes, tables); no DOM, so it runs in the worker pool. TXT/JSON keep lines and indentation (`textBlocks`).
- Fonts: WinAnsi-only documents use jsPDF's built-in Helvetica/Courier (nothing fetched). Anything else uses the Noto subsets in `public/fonts/pdf/`, each fetched only if the document uses its script: `NotoSans-Regular/-Bold` + `NotoSansMono` (Latin, Greek, Cyrillic, Vietnamese), `NotoSansSC` subset (GB 2312 + Big5 level 1 + JIS X 0208 + kana) and `NotoSansKR` (Hangul). jsPDF embeds only the glyphs used. Rebuild with `python3 scripts/build-pdf-fonts.py` (fonttools); `OFL.txt` must ship with them. No italic Noto is shipped: italic sets upright in Unicode mode.
- PDF input (PDF → PNG/JPG/WebP, PDF → TXT/HTML) uses `@hyzyla/pdfium` (MIT wrapper over BSD-3 PDFium; not AGPL mupdf). Page render → `pdfRenderToImageData` → `finishImage` (so the image toolbox applies). The wrapper's render output is already **RGBA** despite its `colorSpace: "BGRA"` option; never swap channels (pinned by a real-PDFium test and the smoke suite's blue-page pair). Text extraction is layout-naive (reading order, no OCR).
- PDF → image defaults to page 1 as a single image. With `ConversionSettings.pdfAllPages` it renders every page at `pdfScale` (1×/2×/3×) and returns a `application/zip` Blob (one `<base>-page-<n>.<ext>` per page via jszip); `downloadJob` names zip outputs `.zip` and `JobCard.canPreview` skips zip blobs. Default (`pdfAllPages=false`) keeps the single-page behaviour.

## EPUB

- `lib/epub-converter.ts` writes EPUB 3 that passes W3C epubcheck with zero errors and warnings (CI runs it on hostile samples). Package: `mimetype` first and stored, `nav.xhtml` (required) plus `toc.ncx`, `dcterms:modified` as `CCYY-MM-DDThh:mm:ssZ`, one `chapter-N.xhtml` per h1/h2 section (a title-only heading merges into the next).
- MD/HTML → XHTML goes DOMParser → `sanitise` (element/attribute whitelist, obsolete tags mapped, forms/scripts/media dropped, unique ids) → XMLSerializer, so md/html → EPUB runs on the main thread. `data:` images are packaged under `images/`; images that can't be packaged become their alt text; `#fragment` links are rewritten to the chapter that holds the id.
- `dc:language`: `<html lang>`, else the dominant script, else `und`.

## Text & Markup Output

- Any converter that writes XML or HTML by hand goes through `lib/markup.ts` (`escapeXml`/`escapeHtml`, `xmlName` for keys → legal element names, `rowsToXml`, `rowsToHtmlTable`). Never interpolate cell values or keys raw.
- HTML → text (htmlToTxt, md/html → PDF) goes through `lib/html-text.ts` `htmlToPlainText`: `DOMParser` (inert — never `innerHTML` on a live-document element, which runs `onerror` handlers), drops script/style, keeps block line breaks.
- Text → PDF lays out one source line at a time (`textToPdfBlob`); don't round-trip through HTML `textContent`, which loses every line break.

- XML → CSV/TSV/YAML (`xmlToRecords` in `lib/xml-converters.ts`) finds the records: the largest run of same-named sibling elements (ties to the shallowest); otherwise the whole document, unwrapped, is one record. Columns: attributes first (`@id`), nested elements as dotted paths, repeated children joined with `; `. fast-xml-parser, no DOM, so XML runs in the worker pool.

- CSV/TSV → JSON and CSV ⇄ TSV stream (`lib/csv-stream.ts`): the File is read in `Papa.LocalChunkSize` slices through a streaming `TextDecoder` and fed to Papa Parse as a stream, so rows are serialised as they arrive (`JsonArrayWriter` output is byte-identical to `JSON.stringify(rows, null, indent)`). Never hand Papa the `File` directly: its own file streamer decodes each slice separately and corrupts multi-byte characters on slice boundaries.

## Media (FFmpeg)

- Command lines come from the pure `buildFfmpegArgs` in `lib/audio-video-converters.ts` — one entry per container in `VIDEO_CONTAINERS` pairing a video codec with an audio codec that muxer accepts. Unit-test args there; don't build them inline.
- WebM is VP8 + Vorbis. In `@ffmpeg/core` 0.12.10 `libvpx-vp9` crashes ("memory access out of bounds") on every input and `libopus` on any stereo source; re-test both in a browser (the smoke suite's mkv → webm pair) before switching after a core upgrade.
- Every exec checks its exit code and deletes its MEMFS files in `finally`. A failed core load is not cached; the next job retries.
- WebCodecs fast path first (`lib/webcodecs-converter.ts`, mediabunny for demux/mux, lazy-imported): mp4/mov/m4v/webm/mkv → mp4/mov/mkv (H.264 + AAC), webm (VP9 + Opus) and wav, without fetching the FFmpeg core. It returns `null` (→ ffmpeg) whenever it can't make the same file ffmpeg would: no WebCodecs, a primary track it would drop (no decoder/encoder), or a mid-way failure. Audio it can't encode is copied only if already in the target codec (AAC on Linux Chrome). Video always re-encodes, at a mediabunny quality tier mapped from the CRF (`crfToQualityTier`); the x264/libvpx preset doesn't apply. It runs inside the media queue, and `terminateFFmpeg` cancels it too (a cancel rethrows, never falls back). The smoke suite pins engines: `ffmpeg …` pairs hide `VideoEncoder`/`AudioEncoder` and must fetch the core, `webcodecs …` pairs must not. Playwright's Chromium has no H.264/AAC, so only VP8/VP9/Opus sources take the fast path there.
- Multi-threaded core (`@ffmpeg/core-mt`, pinned in `FFMPEG_CORE_MT_SHA256`) is opt-in via `NEXT_PUBLIC_FFMPEG_MT_BASE_URL` and used only when `multiThreadEligible` (cross-origin isolated, 4+ cores, 4+ GB when reported). If it fails to load, or an exec throws (a crash, not a clean non-zero exit), the job reruns on the single-threaded core and MT stays off for the session. MT keeps its core JS and thread-script blob URLs alive (threads spawned after load import them); `dropInstance` revokes them. `SMOKE_EXPECT_MT=1` makes the smoke suite fail on any fallback.

## Security Headers (CSP)

- `npm run build` runs `postbuild` → `scripts/security-headers.mjs`, which writes `out/_headers` (site-wide CSP, framing, nosniff, referrer, caching) and injects a per-page `<meta>` CSP listing the SHA-256 of that page's inline scripts. Both are enforced; inline script runs only if hashed. Never hand-edit `out/`.
- Every page is cross-origin isolated: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (for SharedArrayBuffer, which the MT FFmpeg core needs). Any cross-origin subresource must be fetched with CORS or carry CORP, or it is blocked; the smoke suite fails a page that is not `crossOriginIsolated`. Isolation also flips libraries that auto-detect threads: `@jsquash/oxipng` is imported from its single-threaded glue (`codec/pkg/squoosh_oxipng.js`) because its entry point would switch to the parallel build, whose wasm we don't ship.
- The per-page meta policy is `script-src` (hashes) plus `worker-src 'self' blob:`, since mediabunny starts small `blob:` workers from the page; without `worker-src` the meta's `script-src` (no `blob:`) would block them.
- `connect-src` is `'self'` plus the `NEXT_PUBLIC_FFMPEG_BASE_URL`, `NEXT_PUBLIC_FFMPEG_MT_BASE_URL` (and a non-relative `NEXT_PUBLIC_ASSET_BASE`) origins. A new runtime fetch to any other origin needs a change there, and the smoke suite fails on any CSP violation.
- The FFmpeg core is fetched, checked against `FFMPEG_CORE_SHA256` in `lib/audio-video-converters.ts`, and loaded from a `blob:` URL (hence `blob:` in the header `script-src`, which only workers get alone). Upgrading `@ffmpeg/core` means uploading the new files to R2 and updating both hashes.

## Offline (service worker)

- `postbuild` also runs `scripts/build-sw.mjs`, which fills `scripts/sw-template.js` into `out/sw.js` (versioned by a hash of everything it can serve) and writes `out/offline-pack.json`. Both are served `Cache-Control: no-cache`.
- Install precaches only the shell (home + About HTML and what they reference). `/_next/static` is cache-first; `/wasm`, `/fonts`, `/icons` are cached on first use; the FFmpeg core (versioned CDN URL) is cache-first and still hash-checked by the app. Offline navigations to never-visited pages redirect to `/`. "Save for offline use" in the footer (`app/components/OfflineSupport.tsx`) caches the whole pack. New workers wait for old tabs to close (no `skipWaiting`).
- `node scripts/offline-smoke.mjs` proves it in Chromium by stopping the server. Don't test offline with Playwright's `setOffline()`: it doesn't apply to a service worker's own fetches.
- Icons: `npm run icons` renders `public/icons/*.png` (192, 512, maskable 512, apple-touch 180) from `favicon.svg` with resvg.

## Spreadsheets

- XLSX read/write is in-house: `lib/xlsx.ts` on jszip + fast-xml-parser. Do not re-add the npm `xlsx` (SheetJS) package — it is frozen at 0.18.5 with unfixed prototype-pollution and ReDoS advisories.
- Reader decodes shared/inline/rich strings, numbers (15 significant digits, like Excel), booleans, errors, formula results and dates (from the cell's number format, 1900 and 1904 systems). Writer emits one plain sheet. `lib/__tests__/fixtures/sheetjs-*.xlsx` pin the reader against a third-party producer.
- XLSX input converts the first sheet unless `ConversionSettings.xlsxAllSheets`: then → CSV is a zip of `<file>-<sheet>.csv` (plain CSV if there is only one sheet; names via `lib/filenames.ts` `safeFileStem` + `uniqueName`) and → JSON is `{ "<sheet>": rows }`.

## Webpack

- `next.config.ts` disables URL-asset parsing (`parser: { url: false }`) inside `@jsquash/*` and `@hyzyla/pdfium` only, to stop their emscripten/wasm-bindgen `new URL('...wasm', import.meta.url)` glue from emitting dead duplicate `.wasm` under `_next/static/media/`. Extend the `include` regex if another wasm vendor is added with the same pattern.

## Child DOX Index

| Path   | Purpose                             |
| ------ | ----------------------------------- |
| `lib/` | Core conversion logic and utilities |
