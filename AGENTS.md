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
- Browser smoke suite (real codecs, CSP violations fail it): `npm run fixtures`, `npm run serve`, then `npm run smoke`; offline behaviour: `node scripts/offline-smoke.mjs`; accessibility (axe-core, WCAG 2.1 AA, both themes, serious/critical fail): `npm run a11y`. Set `SMOKE_CHROMIUM_PATH` if Google Chrome isn't installed.
- Sync wasm assets: `npm run copy-wasm` (CI runs `npm run copy-wasm -- --check`, which fails on any file under `public/wasm` or `public/ocr` that differs from, or doesn't come from, `node_modules`) (run after install or upgrading `@jsquash/*`, `@resvg/resvg-wasm`, or `@hyzyla/pdfium`; copies all codec/library `.wasm` files from `node_modules` into `public/wasm/`). Files are committed, not gitignored.

## Converter Registry

- `lib/converters.ts` is the one registry: each supported pair is a `Route` `{ from, to, run, thread, settings }` added with `add(...)`. `CONVERSION_MAP`, `findRoute`, `getTargetFormats`, `convertFile`, the worker pool's `runsOnMainThread` and the settings panel all read it. Adding a conversion is one `add` line; never special-case a pair elsewhere.
- `thread: 'main'` for anything that drives ffmpeg.wasm (it has its own worker) or needs the DOM (HTML input, MD → EPUB); everything else runs in the worker pool.
- `settings` lists the `SettingKey` groups the converter actually reads, in panel order; `SETTING_FIELDS` maps each to its `ConversionSettings` fields. `app/components/SettingsPanel.tsx` shows exactly `settingsFor(source, target)`, and the gear icon hides when it is empty. `lib/__tests__/registry.test.ts` records which fields each data/document converter reads and checks media args, so a declared-but-unused (or used-but-undeclared) setting fails; the `CONVERSION_MAP` snapshot pins the route list.
- Format metadata (`FORMATS`, `getFormatInfo`, `getFileExtension`, `formatFileSize`) and the single extension → MIME table `mimeFor` live in `lib/formats.ts`, which imports no converter. Don't add per-module MIME maps.

## Files in, names out

- `lib/drop-files.ts`: drops go through `filesFromDrop`, which expands folders via `webkitGetAsEntry` (the entries must be taken inside the drop handler, before any await; `readEntries` is called until empty because Chrome returns at most 100 per call). Pickers go through `filesFromInput` (`webkitRelativePath`). Hidden files, `Thumbs.db` and `desktop.ini` are skipped, and each job keeps its `folder`, which "Download all" rebuilds in the zip.
- **Every drop is handled by the window listener in ConverterApp.** The drop zone only manages its visual state. It used to call `addFiles` as well, and since the event bubbles to the window, every dropped file was added twice.
- Output names come from a template (`applyNameTemplate` in `lib/filenames.ts`; toolbar "Name as"; saved per viewer in localStorage). Placeholders: `{name} {ext} {source} {n} {date} {w}x{h}`. `{w}x{h}` is the output image size measured after conversion, and is dropped along with its separator when unknown. The extension is always ensured, and unsafe characters become `_`, so a template can't make a path.
- The page has two file inputs (files, and a `webkitdirectory` one); tests and suites target `input[type="file"]:not([webkitdirectory])`.
- Paste (`lib/paste.ts`, window listener in ConverterApp, ignored inside text fields): files as they are; text becomes `pasted.tsv` (equal tab counts on ≥2 lines), `.json` (parses), `.html` (rich text) or `.txt`. Copy puts image results on the clipboard as PNG (`asClipboardPng`; hand ClipboardItem the promise, as Safari requires the write inside the click).
- Files no route reads go through `lib/identify.ts` before they become a card: aliases (`.jfif`, `.htm`, `.yml`…) and magic bytes rename them to a format we read (the card says so); otherwise the job is an `unsupported` error with `params.kind` (image, raw, word, sheet, slides, archive, program, video, audio, unknown) and `describeError` explains it. Signatures text can start with (BM, MZ, FLV, ID3) are checked past the first bytes.
- **UI text:** every visible string comes from `locales/`. `app/components/__tests__/i18n-literals.test.ts` fails on English in JSX, and `i18n-keys.test.ts` fails on a key missing from any locale. Colours come from theme tokens: category colours are `var(--<category>-color)` from `app/components/category-colors.ts`, and accent-coloured text uses `--accent-ink`. Both are chosen to pass 4.5:1 in each theme, and `npm run a11y` checks that. Settings controls live in `app/components/settings/<category>.tsx`.
- History (`lib/history.ts`) is on by default and can be turned off in the Recent panel; off means `addHistoryEntry` writes nothing and the list is deleted. The About page lists everything kept in the browser: keep it true when adding storage.
- Remove and Clear keep the last removal for undo (`removed`/`undoRemove` in `useJobManager`, 10 s toast, Ctrl/⌘+Z); running conversions are cancelled and come back idle.
- "Apply to other .EXT files" copies `sharedSettings(from, to)` (registry): the fields both routes read, never the per-file ones (trim/cut points, subtitle file, PDF page range).
- Installed app: "Open with" comes through `launchQueue` (`lib/launch.ts`); the share sheet POSTs to `/share-target`, which only the service worker answers (files into the `share-inbox` cache, redirect to `/?shared=1`, the page takes and deletes them). `lib/__tests__/manifest.test.ts` keeps the manifest's `file_handlers` and `share_target` accept lists equal to the registry's sources.

## Image Encode (WASM)

- Image output (JPEG/PNG/WebP) is encoded via `@jsquash/*` WASM codecs (mozjpeg/libpng/libwebp), not `canvas.toBlob`. Shared helper: `lib/image-encode.ts`.
- PNG (and the inner PNG of ICO) is losslessly optimized by `@jsquash/oxipng` (Rust) as a post-pass.
- SVG source is rasterized via `@resvg/resvg-wasm` (Rust resvg) in `lib/image-converters.ts`, not `<img>`+canvas (fixes fonts/foreignObject/browser variance). SVG `<text>` renders real glyphs via a bundled Noto Sans (OFL) font at `public/fonts/noto-sans-regular.ttf`, passed to resvg through `font.fontBuffers` (system fonts stay off).
- AVIF and JPEG XL output (and JPEG XL input) go through `@jsquash/avif` / `@jsquash/jxl`, imported from their **single-threaded** emscripten glue (`codec/enc/avif_enc.js`, `codec/enc/jxl_enc.js`, `codec/dec/jxl_dec.js`) and loaded lazily (`lazyModule` in `lib/image-encode.ts`). Their entry points pick a multi-threaded build under cross-origin isolation, and that build needs pthread worker scripts we don't ship. The quality slider maps to each codec's scale (`codecQuality`): JXL 1:1, AVIF shifted by −25 so the default 92 % isn't near-lossless. Both are lossy targets (quality + max size). `lib/__tests__/avif-jxl-real.test.ts` runs the shipped wasm under Node.
- Metadata (`lib/image-metadata.ts`): outputs carry none by default (pixels are re-encoded). `metadata: 'keep' | 'keep-no-gps'` writes a **fresh** EXIF block built from parsed fields (camera, lens, exposure, date, author, optional GPS; Orientation always 1; no maker notes or thumbnails). It is offered only from sources exifr reads (jpg/png/webp/heic/avif) to targets we can write (JPEG APP1, PNG eXIf before IDAT, WebP VP8X + EXIF chunk). `MetadataReport` shows what a file carries and what will be removed. Image → PDF strips APP1/APP13/COM from embedded JPEGs (keeps JFIF, ICC, Adobe) so a photo's location doesn't travel into the PDF. The smoke suite's `geo.jpg` pair checks the default.
- BMP output is a hand-rolled 24-bit encoder (`encodeBmp`; no jSquash codec, and `canvas.toBlob` would silently write PNG). ICO output uses `ico-codec` over PNG bytes from `@jsquash/png`.
- Decode stays native: `createImageBitmap` (AVIF), `HTMLImageElement` (raster), `libheif-js` (HEIC).
- HEIC converts the **primary** image (not necessarily the first in the file; libheif-js's `is_primary()` throws, so `heif_image_handle_is_primary_image` is called on the module). `heicAllImages` zips every image, primary first. `lib/__tests__/heic-real.test.ts` runs the real libheif on a pillow-heif fixture.
- Presets (`lib/presets.ts`) are settings patches; the panel marks whichever one the settings match. Image presets set `quality` and `imageMaxSide` (a longest-side cap applied after any other resize, never enlarging). Video "Lossless" (CRF 0) is offered only for x264 targets, and WebCodecs declines it.
- Codec `.wasm` files live under `public/wasm/` and are lazy-fetched at runtime via `NEXT_PUBLIC_ASSET_BASE` (default `/wasm`), mirroring the `NEXT_PUBLIC_FFMPEG_BASE_URL` + R2 pattern used for FFmpeg core. They are small enough to ship from the static export, not R2.

## PDF

- PDF output (txt/md/html/json → PDF) is typeset by `lib/pdf-layout.ts` (`renderPdf` over `Block`s of styled `Run`s) on `jspdf`. Markdown → blocks comes from `marked.lexer` in `lib/markdown-blocks.ts` (headings, bold/italic/code, links, nested lists, code blocks, quotes, tables); no DOM, so it runs in the worker pool. TXT/JSON keep lines and indentation (`textBlocks`).
- Fonts: WinAnsi-only documents use jsPDF's built-in Helvetica/Courier (nothing fetched). Anything else uses the Noto subsets in `public/fonts/pdf/`, each fetched only if the document uses its script: `NotoSans-Regular/-Bold` + `NotoSansMono` (Latin, Greek, Cyrillic, Vietnamese), `NotoSansSC` subset (GB 2312 + Big5 level 1 + JIS X 0208 + kana) and `NotoSansKR` (Hangul). jsPDF embeds only the glyphs used. Rebuild with `python3 scripts/build-pdf-fonts.py` (fonttools); `OFL.txt` must ship with them. No italic Noto is shipped: italic sets upright in Unicode mode.
- PDF input (PDF → PNG/JPG/WebP, PDF → TXT/HTML) uses `@hyzyla/pdfium` (MIT wrapper over BSD-3 PDFium; not AGPL mupdf). Page render → `pdfRenderToImageData` → `finishImage` (so the image toolbox applies). The wrapper's render output is already **RGBA** despite its `colorSpace: "BGRA"` option; never swap channels (pinned by a real-PDFium test and the smoke suite's blue-page pair). Text extraction is layout-naive (reading order, no OCR).
- PDF → image defaults to page 1 as a single image. With `ConversionSettings.pdfAllPages` it renders every page at `pdfScale` (1×/2×/3×) and returns a `application/zip` Blob (one `<base>-page-<n>.<ext>` per page via jszip); `downloadJob` names zip outputs `.zip` and `JobCard.canPreview` skips zip blobs. Default (`pdfAllPages=false`) keeps the single-page behaviour.

## PDF tools

- `lib/pdf-tools.ts` (pdf-lib 1.17.1, MIT; lazy-loaded through wrappers in the registry, since it's ~420 KB) covers:
  - `pdf → pdf` (`editPdf`): pages in a chosen range and order (`pdfPageRange`, e.g. `3,1,5-4`, `8-`), added rotation, split to a zip of `<file>-page-<n>.pdf`, and optional compression.
  - every image → one-page PDF (`imageToPdf`, A4/Letter with the image fitted at 96 dpi, or "fit" to the image). JPEG/PNG are embedded byte-for-byte; other formats are decoded, then re-encoded as JPEG if opaque or PNG if they have alpha.
  - `mergePdf`: PDFs and images in list order. It's a toolbar batch action (`mergeToPdf` in `useJobManager`), not a route; job cards get move up/down for the order.
- Compression re-renders pages through PDFium as JPEG (medium 150 dpi/q75, strong 100 dpi/q60). Page sizes come from pdf-lib's page box, not the rounded bitmap. The result is kept only if it's smaller. Text stops being selectable, so it's opt-in.
- `lib/pdf-options.ts` holds the light parts (`parsePageRange`, `isPageRangeSyntax`, `canMerge`) so the UI never imports pdf-lib. A range beyond the document is `ConversionError('invalid-settings')` (its own localized message: fix the setting, not the file). A password-protected PDF is `unsupported`. A merge failure names the file.

## Subtitles

- `lib/subtitles.ts`: SRT and VTT are read leniently by one parser (BOM, CRLF/CR, missing cue numbers, `.` or `,` before milliseconds, missing hours, NOTE/STYLE/REGION blocks, cue ids and settings) and written strictly. Only `<b>`, `<i>` and `<u>` survive; `<v Speaker>` becomes "Speaker: ", and `<font>`, class spans, karaoke timestamps and `{\an8}` overrides are dropped. VTT output can't hold `-->` or a blank line inside a cue.
- Routes: SRT ⇄ VTT, each to itself for re-timing (`subtitleOffset` in seconds; cues moved before 0 are clipped or dropped), and → TXT as a transcript. Burning subtitles into a video is a setting on the video's job (see Media).

## OCR

- tesseract.js 7 (Apache-2.0), **self-hosted** under `public/ocr` (copied by `npm run copy-wasm`): `worker.min.js`, the two LSTM cores (`tesseract-core{-simd,}-lstm.{js,wasm}`, picked with `wasm-feature-detect`), and `lang/<code>.traineddata.gz` (tessdata 4.0.0 best_int for eng, spa, fra, deu, chi_sim, chi_tra, jpn, kor; from the `@tesseract.js-data/*` devDependencies). Its defaults would fetch all of that from third-party CDNs, which the CSP blocks. Nothing loads before the first OCR job; `/ocr` is cached on first use and kept out of the offline pack (about 20 MB).
- `lib/ocr.ts`: one tesseract worker per language (switching languages terminates the old one), jobs queued, a failed start not kept. It runs as a nested worker started from the conversion worker, so the main thread stays free; without nested workers (old Safari) it fails with `unsupported`. Images are decoded by us (EXIF orientation applied, alpha flattened onto white) and passed as BMP bytes (a `Uint8Array`: tesseract's Node build, used in tests, reads nothing else).
- Routes: every raster image → txt (`ocr` setting = `ocrLanguage`). PDF → txt/html OCR only the pages with no text layer (scans), rendered at 2× through PDFium. `lib/__tests__/ocr-real.test.ts` runs real tesseract on the shipped language data; the smoke suite checks `ocr.png → txt` and a scanned `scan.pdf → txt`.

## Word (DOCX)

- Input: mammoth (BSD-2, lazy) → semantic HTML with images inlined as `data:` URIs. DOCX → HTML/TXT run in the worker. DOCX → MD/PDF/EPUB go on through Turndown (DOM), so they're main-thread; PDF is typeset from the Markdown blocks, so headings, lists and tables survive. A non-DOCX (or a legacy binary `.doc`) is `corrupt-input` with a "re-save as .docx" hint. mammoth's browser build takes `{ arrayBuffer }` and its Node build `{ buffer }`, so both are passed.
- Output: `lib/docx-writer.ts` writes DOCX by hand on jszip from the PDF typesetter's `Block`s. It's used for MD/TXT → DOCX in the worker and HTML → DOCX via Turndown on the main thread. Each source list is its own Word list with per-level formats (bullet or numbered, from its first item), so nesting keeps its type and numbered lists keep their start. XML-illegal control characters are dropped. **Word enforces schema child order**: build `w:rPr`/`w:pPr` in schema order (`rPr()` helper); `docx.test.ts` checks the order in every part. Validated with mammoth and python-docx (a third-party fixture: `lib/__tests__/fixtures/python-docx-sample.docx`).
- Turndown has no table rule; `htmlStringToMarkdown` adds one that writes GFM pipe tables. Before it, HTML → MD flattened every table cell into its own paragraph.

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
- `buildFfmpegArgs` reads settings lazily (`knobsFrom` getters), and `registry.test.ts` records which fields each route's command line reads against what the route declares. So AVI/FLV (fixed quantiser) declare `videoQuality` but not `videoPreset`, and lossless audio declares no bitrate.
- Trim (`trimStart`/`trimEnd`, seconds) applies to every media route: `-ss`/`-t` as input options in ffmpeg (`trimArgs`), mediabunny's `trim` on the WebCodecs path (`trimRange`, same rules). An end at or before the start means "to the end". The panel takes `1:30.5` or `90` via `lib/timecode.ts`.
- Video → video can be resized (`videoMaxWidth`: ffmpeg `scale='min(W,iw)':-2`; WebCodecs `fitWidth` gives the same even-sided size) and muted (`mute`: `-an`, or discarding the audio track in mediabunny). The trim card has a scrubber (`app/components/TrimScrubber.tsx`): the browser's own player plus "set start/end" at the playhead. Formats the browser can't play just show the typed fields.
- Cut (`cutStart`/`cutEnd`, source time, part of the `trim` group): `cutRange` converts it to the trimmed clip's timeline. Video uses `select='not(between(t,a,b))'` + `setpts='PTS-gte(T,b)*(b-a)/TB'`, which keeps variable frame rates intact (never `N/FRAME_RATE/TB`). Audio uses `aselect` + `asetpts=N/SR/TB`. WebCodecs declines a cut (mediabunny only trims).
- Subtitle burn-in (`subtitleFile`, video targets): `prepareSubtitles` shifts the cues by the trim and writes **ASS** (`toAss`) plus only the Noto fonts the text needs into `/fonts` (fetched once per instance from `/fonts/pdf`). The core has libass but no fontconfig, so libass never falls back to another font: `toAss` names a font per script run (`{\fn…}`), spaces included, since the CJK/Hangul subsets have no space glyph. The `subtitles` filter runs before the cut and the scale. WebCodecs declines.
- Video → GIF is one ffmpeg pass: `fps,scale` then `split` into `palettegen=stats_mode=diff` / `paletteuse=dither=bayer:diff_mode=rectangle`. GIF and animated WebP share `animFps`/`animWidth` (default 12 fps, 480 px, only ever scaled down; 0 = source width).
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
- Network badge (`app/components/NetworkBadge.tsx`, in the status bar above the drop zone): the worker counts bytes sent (request bodies) and received (Content-Length, else the body) for everything that reaches the network, from pages and their workers; requests it has no rule for pass straight through `net()`, counted. Any new fetch path in the worker must go through `net()`, or the badge stops being the proof behind "0 B sent". The count persists in the `network-log` cache and is pushed over a `BroadcastChannel`.
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
