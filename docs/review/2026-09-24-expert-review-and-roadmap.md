# convert-it — Technical Review & Enhancement Roadmap

_Reviewed at `7a92641` (2026-09-24). Scope: every file in `lib/`, the app shell, CI/deploy config, dependencies. Baseline: `tsc` clean, ESLint clean, Vitest 157/157 passing, Prettier reports 36 unformatted files, `npm audit --omit=dev` reports high/critical advisories._

---

## Status

- **Phase 0: done.** C1, C3, C4, C5, C8–C12, S2, C17, plus C7 (duration-based progress; the log parser was being rewritten anyway). Each fix has tests that check the output is valid. Every media target was run against the real `@ffmpeg/core` 0.12.10 in both Chromium and Node.
- **New findings while doing C3:** in `@ffmpeg/core` 0.12.10, `libvpx-vp9` crashes on every input ("memory access out of bounds"), so WebM output never worked, AAC or not. `libopus` also crashes on any stereo source; this was caught by the Phase 1 browser smoke test (MKV → WebM). WebM is now **VP8 + Vorbis**. Re-test both codecs in a browser before switching back after a core upgrade.
- **Phase 1: done.**
  - **S1:** CSP. There is a site-wide header policy plus a per-page meta policy that hashes each page's inline scripts; injected inline script and foreign-origin `fetch` were verified blocked.
  - **S3:** SheetJS was replaced by an in-house reader/writer (`lib/xlsx.ts`). exceljs was rejected: it adds its own advisories and about 1 MB.
  - **S4:** dependency bumps. `npm audit --omit=dev` reports 0, and CI now fails on high-severity advisories.
  - **S5:** the FFmpeg core is checked against a pinned SHA-256 and loaded from a `blob:` URL.
  - **Hygiene:** caching headers, Prettier check in CI, and the browser smoke suite in CI against the built site with `_headers` applied (it fails on any CSP violation). Also Dependabot and an updated `lib/AGENTS.md`.
  - **Open:** dev-only audit advisories remain because `npm audit fix` crashes on the `overrides` field; they are left for Dependabot.
- **Phase 2: done.**
  - **C2 (PDF output):** Unicode typesetting via Noto subsets loaded per script. WinAnsi-only documents still fetch nothing. Markdown is styled: headings, emphasis, lists, code, quotes, tables and links.
  - **C6 (EPUB):** EPUB 3 now passes W3C epubcheck with 0 errors and 0 warnings, enforced in CI.
  - **C13:** PDF pages go through the image toolbox, and text extraction reports progress per page.
  - **C14:** XML → table works on real-world XML and runs in the worker pool.
  - **C15:** XLSX input can convert every sheet.
  - **§5:** CSV now streams.
  - **C16:** CSV → TSV escaping.
  - **P2 (downscaling):** closed on evidence. Chromium's single 'high' draw already averages correctly, and step-halving was worse (60/127 vs 1/127 max error).
  - **New bugs found and fixed:**
    - **PDF → image colours:** every PDF → image had red and blue swapped. The pdfium wrapper already returns RGBA and the app swapped the channels again.
    - **CSV streaming:** Papa Parse's `File` streamer corrupts multi-byte characters on slice boundaries.
    - **EPUB:** every EPUB, even plain text, failed epubcheck.
- **Phase 3: done.**
  - **Typed errors:** every failure is classified (too large, out of memory, damaged input, unsupported, engine failed to load, unknown) and shown with a localized title, a hint, and the technical detail behind a disclosure.
  - **Worker pool:** idle workers are reaped after 60 s. Transfer lists were measured and left out: results are Blobs, which already cross by reference.
  - **Offline:** a generated service worker precaches the shell and caches engines on first use (FFmpeg core cache-first, still hash-checked), and "Save for offline use" caches everything. Real PNG and maskable icons were added. An offline suite in CI stops the server to prove it.
  - **Registry:** one list of routes drives target formats, threads and the settings panel. Tests check that each route's declared settings are exactly the ones its converter reads. This removed no-op controls and surfaced two hidden ones (audio bitrate for video, the image toolbox for `.jpeg`). JobCard and ConverterApp were split.
  - **COOP/COEP + core-mt:** every page is cross-origin isolated. `@ffmpeg/core-mt` is used on capable devices when `NEXT_PUBLIC_FFMPEG_MT_BASE_URL` is set, falling back to single-threaded on load failure or crash. It gives 2.8× on x264 and 1.9× on VP8 on 4 cores, but stays off in production until its files are uploaded to R2 (README).
  - **WebCodecs:** a fast path via mediabunny, with ffmpeg as the fallback. 720p MKV → WebM takes 4.4 s vs 26 s (multi-threaded core) or about 10× the single-threaded core. Trim was not built; it needs a timeline UI (Phase 4 item 4).
  - **New bugs found and fixed:**
    - **"Add files":** after the first file, "Add files" and the compact drop target did nothing. The only file input unmounted with the drop zone.
    - **oxipng under isolation:** `@jsquash/oxipng` switched to its parallel build (whose wasm isn't shipped), which would have broken every PNG output. It is now pinned to the single-threaded glue.

## 1. Executive summary

The core architecture is good, and better than most commercial converters: fully client-side, lazily loaded WASM codecs, a worker pool that you can cancel, conservative memory ceilings, a registry that generates both the conversion map and the SEO pages, and comments that explain _why_. There is real engineering judgement here.

The weak spots are where apps like this usually go wrong once they have grown:

1. **Output correctness in the "long tail" converters.** Image/PDF-input/media are well built; the text/data/document converters were written quickly and several produce **invalid or silently wrong files** (details in §3). That is the biggest risk to the product: a converter that returns a broken file with a green checkmark loses user trust faster than one that errors.
2. **Security posture for untrusted input.** A converter parses hostile files by definition. There is no CSP, one path runs user HTML in the app origin, and SheetJS 0.18.5 (unpatched on npm) parses every `.xlsx`.
3. **Media pipeline robustness.** Some format pairs can't work (WebM + AAC), progress is fictional for anything but ~10 s clips, and a single transient CDN failure disables video/audio until the page is reloaded.
4. **No quality gate on output.** Tests check that converters run, not that their output is _valid_ (XML well-formedness, EPUB structure, PDF text). CI has no end-to-end browser run, so the real WASM paths are never tested before deploy.

Recommendation: **spend the next cycle on correctness and hardening (Phases 0–1) before adding formats.** The feature roadmap (Phases 2–4) comes after, and a few of those items are high-leverage product wins.

---

## 2. What's working well (keep these)

| Area                      | Why it's good                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Zero-backend architecture | Strong privacy story and near-zero hosting cost. Contract enforced in `AGENTS.md`.                                               |
| Codec choice              | mozjpeg/libwebp/oxipng/resvg/PDFium are best-in-class, and the licences are clean (PDFium over AGPL mupdf was the right call).   |
| Lazy loading              | Every heavy dependency (resvg, pdfium, SheetJS, jsPDF, ffmpeg) is `import()`ed on first use. Initial JS stays small.             |
| `worker-pool.ts`          | Correct cancel semantics (terminate + respawn), crash → task rejection, core-aware sizing with a memory cap.                     |
| ffmpeg queue              | Serialising jobs on the single MEMFS avoids a real race that would corrupt output.                                               |
| `storage.ts`              | Handles storage that throws (Safari private mode, blocked site data) properly. Rare to see.                                      |
| `pairs.ts`                | SEO landing pages come from the registry, so they can't drift from what the app actually converts.                               |
| Target-size search        | A binary search over real encodes is the right algorithm; returning the smallest result when the budget can't be met is good UX. |

---

## 3. Findings — correctness bugs (ranked)

Severity: **P0** = wrong or broken output a user will hit; **P1** = wrong in common edge cases; **P2** = quality issue.

### P0

| #   | Where                                                    | Defect                                                                                                                                                                                                                                                                                                                          | Evidence / scenario                                             |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1  | `lib/pdf-converters.ts` `htmlToPdfBlob`                  | **TXT/MD/JSON → PDF loses every line break.** The helper builds HTML (`<p>` per line, `<br/>` for JSON), then flattens it with `textContent`, which concatenates block elements with no separator. A 50-line text file becomes one wrapped paragraph; JSON → PDF becomes a single blob of text.                                 | Verified in jsdom: `<p>line1</p><p>line2</p>` → `"line1line2"`. |
| C2  | `lib/pdf-converters.ts`                                  | **Non-Latin text renders as garbage in PDF output.** jsPDF's built-in Helvetica is WinAnsi-only, but the app ships zh-CN/zh-TW/ja/es locales. CJK, Cyrillic, Greek, emoji → mojibake or blank.                                                                                                                                  | Any Chinese `.txt` → PDF.                                       |
| C3  | `lib/audio-video-converters.ts`                          | **Any video → WebM fails.** Video args always use `-c:a aac`; the WebM muxer accepts only Vorbis/Opus. `-preset` is also not a libvpx option.                                                                                                                                                                                   | MP4 → WebM with an audio track.                                 |
| C4  | `lib/csv-converters.ts`, `yaml-converters.ts` (`*ToXml`) | **Invalid XML output.** Values aren't escaped (`&`, `<`), and column names become tag names unsanitised (`First Name`, `2024`, `a/b` are illegal element names). Nested YAML values become `[object Object]`.                                                                                                                   | CSV header `First Name`, a value `AT&T`.                        |
| C5  | `lib/csv-converters.ts` (`*ToHtml`, `jsonToHtml`)        | **Unescaped HTML output.** Cell text containing `<`, `&`, or markup produces broken tables, and the downloaded file runs any `<script>` a data cell contains.                                                                                                                                                                   | A CSV cell of `<b>` or `a < b`.                                 |
| C6  | `lib/epub-converter.ts`                                  | **EPUBs fail validation / won't open in strict readers** (Apple Books, Kobo): (a) no EPUB 3 `nav` document (required), (b) `marked` and raw HTML output are HTML, not XHTML (`<br>`, `<img>` not self-closed, entities), (c) `htmlToEpub` nests a full `<html>` document inside `<body>`, (d) `dc:language` is hard-coded `en`. | Run any output through `epubcheck`.                             |

### P1

| #   | Where                                                | Defect                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C7  | `audio-video-converters.ts` `makeProgressLogHandler` | Progress is `seconds / 10 * 85`, so any clip longer than ~10 s sits at 95 % almost at once. Parse `Duration:` from the log, or use ffmpeg.wasm's `progress` event.                                                                                                                                |
| C8  | `audio-video-converters.ts` `getFFmpeg`              | `ffmpegError` sticks: one failed core fetch (flaky network, CDN blip) makes every later media job fail until reload. Clear it on retry, and add backoff.                                                                                                                                          |
| C9  | `audio-video-converters.ts`                          | `ff.exec` exit code is ignored, and input/output files are only deleted on success. A failed exec surfaces as a confusing `readFile` error and leaks up to 500 MB in MEMFS for the next job. Wrap in `try/finally`, check the return code, and surface the last stderr lines.                     |
| C10 | `audio-video-converters.ts`                          | `settings?.videoQuality \|\| 23` treats CRF 0 (lossless) as unset; `-movflags +faststart` is passed to AVI/MKV/FLV; `-crf` is passed to the `flv`/`mpeg4` codecs, which ignore it. Build args per container from a table.                                                                         |
| C11 | `useJobManager.ts` `downloadAllAsZip`                | (a) Duplicate names overwrite each other (`a.jpg`+`a.png` → both `a.png` when targeting PNG, or two `IMG_0001.HEIC` from different folders). (b) A PDF all-pages result (itself a zip) is stored as `.png`. De-duplicate names, and use the same ext logic as `downloadJob`.                      |
| C12 | `useJobManager.ts` `downloadJob`                     | `URL.revokeObjectURL` runs synchronously after `a.click()`. That is unreliable in Firefox/Safari for large blobs; defer it (for example `setTimeout(..., 60_000)`).                                                                                                                               |
| C13 | `pdf-converters.ts` `pdfToImage`                     | Ignores the image toolbox (resize/crop/target size) because it calls `encodeImageData` instead of `finishImage`. Settings the UI shows then do nothing.                                                                                                                                           |
| C14 | `xml-converters.ts` `xmlToCsv/Yaml/Tsv`              | Only accept the app's own `<root><row>` shape; any real-world XML errors or returns `[]`. Detect the repeating child element automatically. Also move off `DOMParser` to `fast-xml-parser` (already a dependency), which lets XML run in the worker pool as the `worker-pool.ts` comment intends. |
| C15 | `xlsx-converters.ts`                                 | Only the first sheet is converted, silently. Offer a sheet picker, or zip one CSV per sheet.                                                                                                                                                                                                      |
| C16 | `csvToTsv`, `jsonToMd`                               | Tabs/newlines inside CSV cells and `\|` inside Markdown cells aren't escaped, which corrupts the table.                                                                                                                                                                                           |
| C17 | `htmlToTxt`, `htmlToPdfBlob`                         | `<script>`/`<style>` contents leak into the text output. Remove those nodes before reading `textContent`.                                                                                                                                                                                         |

### P2

- `heic-converter.ts`: only the primary image; burst/multi-image HEIC loses frames. The `any` type on `image`.
- `image-encode.ts`: single-pass bilinear downscale below 1/3 is soft (noted in a comment). Step-halving or a Lanczos pass (for example via `@jsquash/resize`) fixes it.
- `pdfToText`/`pdfToHtml`: no progress reporting on large PDFs.
- `lib/AGENTS.md` still describes "Cloudflare Functions" and an edge runtime, which contradicts the root contract ("no server code"). Update it so agents don't reintroduce `functions/`.

---

## 4. Findings — security

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **High** | **No Content-Security-Policy or security headers.** For an app whose whole job is parsing untrusted files, CSP is the main defence in depth.                                                                                                                                                                           | Add `public/_headers` (Cloudflare Pages): `Content-Security-Policy` with `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' <ffmpeg CDN>; worker-src 'self' blob:; connect-src 'self' <ffmpeg CDN>; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. The inline theme and JSON-LD scripts need hashes. |
| S2  | **High** | **HTML → PDF parses user HTML into the live document.** `document.createElement('div').innerHTML = userHtml` fires event handlers such as `<img src=x onerror=…>`, even on a detached node. A crafted `.html` then runs script in the app origin (it can read history in localStorage, and later any stored settings). | Use `new DOMParser().parseFromString(html, 'text/html')`, which gives an inert document. This also lets it move to the worker.                                                                                                                                                                                                                                                                                                                      |
| S3  | **High** | **`xlsx@0.18.5` has unfixed prototype-pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) advisories.** SheetJS no longer publishes to npm.                                                                                                                                                                | Install the patched build from the SheetJS CDN (`https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz`) pinned by integrity, or switch to `exceljs`/`read-excel-file`. It already runs in a worker, which contains the ReDoS impact.                                                                                                                                                                                                                 |
| S4  | Medium   | `npm audit`: `next@15.1.0` (critical/high; mostly server-side, so the static export isn't exposed, but the dev server is), `marked@18.0.0–18.0.1` (OOM DoS on crafted Markdown, **reachable**), `dompurify` via jsPDF (moderate).                                                                                      | Bump `next` to the latest 15.x, `marked` ≥ 18.0.2, `jspdf` latest. Add `npm audit --omit=dev --audit-level=high` to CI (with an allowlist for SheetJS until S3 lands).                                                                                                                                                                                                                                                                              |
| S5  | Medium   | The ffmpeg core (31 MB wasm plus JS) loads cross-origin with no integrity check.                                                                                                                                                                                                                                       | Keep a SHA-256 of the core in the repo, fetch it as an `ArrayBuffer`, verify with `crypto.subtle.digest`, then `load()` from a blob URL.                                                                                                                                                                                                                                                                                                            |
| S6  | Low      | History stores original filenames in localStorage indefinitely. Filenames can be sensitive (`divorce-settlement.pdf`).                                                                                                                                                                                                 | Add a "don't keep history" toggle, and make the About page state plainly what is stored locally.                                                                                                                                                                                                                                                                                                                                                    |

---

## 5. Findings — performance & reliability

- **Caching.** There is no `_headers`, so Cloudflare Pages serves `public/wasm/*` (7.4 MB) and the font with revalidation on every visit. Version the wasm filenames (or add `?v=<pkg version>` in `ASSET_BASE` URLs) and send `Cache-Control: public, max-age=31536000, immutable`. Do the same for `/_next/static/*`.
- **Offline / PWA.** The manifest exists but there is no service worker, so "works offline", the natural promise of a no-upload converter, isn't delivered. Its only icon is SVG; Android/Chrome install needs 192/512 px PNG and a maskable icon.
- **ffmpeg multithreading.** The single-threaded core is roughly 2–4× slower than `@ffmpeg/core-mt`. MT needs COOP/COEP (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`), and the R2 CDN must send `Cross-Origin-Resource-Policy`. Ship it behind feature detection (`crossOriginIsolated`), falling back to the ST core.
- **WebCodecs fast path.** For common pairs (H.264 MP4 → WebM/MP4 re-encode, trim, audio extract), `WebCodecs` + `mp4box.js`/`webm-muxer` is hardware-accelerated and often 10× faster than ffmpeg.wasm, with no 500 MB ceiling (it streams). This is the biggest performance lever for video.
- **Memory.** `file.arrayBuffer()` / `file.text()` load everything into memory; CSV/JSON at 100 MB means several copies once parsed. Papa Parse supports streaming (`step`/`chunk`), so use it for CSV/TSV and lift the data ceiling.
- **Worker pool.** Each task posts a `File` (cheap; structured clone is by reference), but the result `Blob` comes back from the worker and the ImageData copies aren't transferred. Transfer `ArrayBuffer`s where the code builds them. Also idle workers are never reaped; terminate them after about 60 s idle to free codec heaps.
- **Main-thread converters** (XML, HTML, anything → PDF) freeze the UI on large inputs. Fixing S2/C14 (DOMParser → inert parsing / fast-xml-parser) lets all three move into the pool.

---

## 6. Findings — engineering hygiene

- **Output validation tests.** The current tests assert that a converter returns a Blob, not that the Blob is valid. Add property-style tests: XML output parses with `fast-xml-parser` in strict mode; HTML cells round-trip escaped text; EPUB passes a structural check (mimetype first and STORED, nav present, XHTML parses as XML); PDF text extracted with pdfium equals the input lines; CSV → X → CSV round-trips a fixture containing quotes, commas, newlines, tabs, unicode and a BOM.
- **E2E in CI.** `scripts/smoke.mjs` (Playwright) exists but CI skips it. Chromium is available on `ubuntu-latest`; run the smoke suite against `out/` on every PR. It is the only thing that exercises the real WASM codecs, workers and `_headers`.
- **Prettier drift.** 36 files fail `prettier --check`, and CI doesn't run it. Run `npm run format` once in its own commit (then add it to `.git-blame-ignore-revs`) and add the check to CI.
- **Component size.** `JobCard.tsx` (911 lines) and `ConverterApp.tsx` (763 lines) mix settings UI, preview, actions and layout. Split `SettingsPanel` per category (`ImageSettings`, `MediaSettings`, `DataSettings`). Settings UI should come from a declarative schema next to each converter, so a new converter declares its knobs once.
- **Converter registry.** `convertFile` special-cases heic/avif/image/media ahead of the registry. Move to a single registry of `{ from, to, run, settingsSchema, runsIn: 'worker'|'main', mime }`. That keeps `runsOnMainThread`, `CONVERSION_MAP`, `pairs.ts`, the MIME table and the settings UI from drifting (today MIME types live in three places).
- **Error taxonomy.** Errors are free-text strings from engines. Introduce typed errors (`UnsupportedInput`, `TooLarge`, `CorruptInput`, `EngineLoadFailed`, `OutOfMemory`) mapped to localized, actionable messages, such as "This video is too large for your browser's memory — try WebM at a lower resolution".
- **Dependabot/Renovate**, grouped weekly, with the `copy-wasm` step wired into a post-update check so `public/wasm/` can't drift from `node_modules`. Add a CI step that diffs `public/wasm/` hashes against `node_modules`.

---

## 7. Product & UX opportunities

The 2026-09-09 critique (`.impeccable/critique/`) scored 19/40, and `7a92641` addressed its P0 (drop-listener unmount) and the contrast issues. What remains, in priority order:

1. **Make "nothing leaves your device" visible and provable.** Add a live "0 bytes uploaded" network badge. An optional "offline mode" indicator backed by the service worker is the most credible trust signal a converter can offer, and it is the real differentiator against CloudConvert/Zamzar.
2. **Presets instead of raw knobs.** Replace CRF/preset selects with "Smallest / Balanced / Best quality / Lossless", keeping an "Advanced" disclosure. Do the same for images ("Web", "Email", "Print").
3. **Unsupported-file cards explain themselves.** Say why a format isn't supported and what the nearest supported input is.
4. **Undo for Clear**, or a confirm step when converted results haven't been downloaded yet.
5. **Before/after preview** for images (slider) with live size estimate, which fits the existing target-size feature.
6. **Share-target / file-handler integration.** `share_target` in the manifest (Android: "Share → Convert-it") and `file_handlers` (desktop PWA: "Open with Convert-it"). Both are cheap, and they turn the app into an OS-level tool.
7. **Paste from clipboard** (Ctrl+V an image or a spreadsheet selection) and **copy result to clipboard** for images.
8. **Per-job settings → batch settings.** Today settings are per card; batches of 50 photos need "apply these settings to all".

---

## 8. Roadmap

Effort: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks (one engineer).

### Phase 0 — Stop shipping broken files (1 week)

| Item                                                                                                  | Refs     | Effort |
| ----------------------------------------------------------------------------------------------------- | -------- | ------ |
| Fix PDF line breaks (build lines from text directly; no HTML round-trip for txt/json)                 | C1       | S      |
| Escape XML/HTML output; sanitise element names (`First Name` → `First_Name`, leading digit → `_2024`) | C4, C5   | S      |
| WebM: Opus audio + libvpx args; per-container arg table; CRF-0 bug                                    | C3, C10  | S      |
| ffmpeg: exit-code check, `finally` cleanup, clear sticky error on retry                               | C8, C9   | S      |
| Replace `innerHTML` with `DOMParser`; strip script/style                                              | S2, C17  | S      |
| Zip naming de-dup + zip-in-zip ext; deferred `revokeObjectURL`                                        | C11, C12 | S      |
| Output-validity tests for each fixed converter                                                        | §6       | M      |

### Phase 1 — Harden & gate (1–2 weeks)

| Item                                                                                      | Refs   | Effort |
| ----------------------------------------------------------------------------------------- | ------ | ------ |
| `public/_headers`: CSP + security headers + immutable caching for wasm/static             | S1, §5 | M      |
| Replace npm `xlsx` with the patched SheetJS build (or exceljs)                            | S3     | S      |
| Bump next/marked/jspdf; `npm audit` gate in CI                                            | S4     | S      |
| Playwright smoke suite in CI against `out/`; Prettier check in CI; one-time format commit | §6     | M      |
| ffmpeg core integrity verification                                                        | S5     | S      |
| Real ffmpeg progress (duration-based)                                                     | C7     | S      |
| Update `lib/AGENTS.md` to match the no-server contract                                    | P2     | S      |

### Phase 2 — Quality of output (2–3 weeks)

| Item                                                                                                                                                                                                       | Refs    | Effort |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| Unicode PDF output: embed a subset of Noto Sans / Noto Sans CJK (lazy-loaded per script) with `doc.addFont`. Render Markdown headings, lists, code and tables with real styling instead of flattened text. | C2      | M–L    |
| Valid EPUB 3: XHTML serialisation (via `XMLSerializer` on a parsed doc), nav doc, chapter split on `<h1>/<h2>`, language detection, optional cover image; `epubcheck` in tests                             | C6      | M      |
| PDF → image honours the toolbox; per-page progress for text extraction                                                                                                                                     | C13     | S      |
| Generic XML → tabular (auto-detect repeating element); move XML to fast-xml-parser/worker                                                                                                                  | C14     | M      |
| Multi-sheet XLSX (sheet picker, or zip of CSVs); streaming CSV                                                                                                                                             | C15, §5 | M      |
| High-quality downscale (Lanczos / step-halving)                                                                                                                                                            | P2      | S      |

### Phase 3 — Performance & platform (3–4 weeks)

| Item                                                                                                           | Effort |
| -------------------------------------------------------------------------------------------------------------- | ------ |
| Service worker (precache app shell + wasm; ffmpeg core cached on first use) → true offline; PNG/maskable icons | M      |
| COOP/COEP + `@ffmpeg/core-mt` with ST fallback                                                                 | M      |
| WebCodecs fast path for MP4/WebM transcode, audio extract, trim; ffmpeg as fallback                            | L      |
| Inert main thread: every non-media converter in the worker pool; idle-worker reaping; transferables            | M      |
| Unified converter registry with declarative settings schema; split JobCard/ConverterApp                        | L      |
| Typed, localized, actionable errors                                                                            | M      |

### Phase 4 — Features that move the needle (ongoing, pick by demand)

Ranked by (user demand × fit with the local-only architecture) ÷ effort:

1. **Video → GIF / animated WebP with trim** (top-searched pair; ffmpeg palettegen already available). M
2. **Image output: AVIF and JPEG XL** via `@jsquash/avif` and `@jsquash/jxl`; same pipeline, one more `.wasm` each. S–M
3. **PDF tools:** merge, split, reorder, rotate, compress, images → PDF (pdf-lib, MIT). Very high search volume, and it fits the architecture. M–L
4. **Media trim / cut / resize / mute** with a timeline scrubber. M
5. **Metadata controls:** strip EXIF/GPS (privacy selling point) or preserve it; show what was removed. S
6. **DOCX input/output** (mammoth.js for DOCX → HTML/MD; `docx` package for MD → DOCX). M
7. **OCR for scanned PDFs/images** (tesseract.js, lazy-loaded, ~10 MB per language). M
8. **Subtitles** (SRT ↔ VTT, burn-in via ffmpeg). S
9. **Folder drop / batch rename templates** (`{name}-{w}x{h}.{ext}`). S
10. **Local analytics without tracking**: a privacy-safe, cookie-less count per conversion pair (for example Cloudflare Web Analytics, which is script-only with no PII) to decide what to build next. This needs a policy decision against the privacy promise. S

---

## 9. Suggested success metrics

- **Output validity:** 100 % of converter outputs pass a structural validator in CI (XML parse, epubcheck, PDF text round-trip, image decode).
- **Failure rate:** failed conversions / attempted, broken down by pair (local-only counter, or opt-in).
- **Time-to-first-conversion** (cold): under 2 s for images; media engine fetch shown as its own labelled phase.
- **Media throughput:** at least 2× from core-mt, and at least 5× on WebCodecs-eligible pairs, measured against fixed fixtures.
- **Lighthouse:** PWA installable; Best Practices 100 once CSP lands.

---

## 10. Suggested first PR

Phase 0 as a single PR (each fix is small and has its own test), in this order: C1 → C4/C5 → S2/C17 → C3/C10 → C8/C9 → C11/C12. This removes every known "green checkmark, broken file" path and the one XSS vector. It needs no dependency changes, so it is low risk to review.
