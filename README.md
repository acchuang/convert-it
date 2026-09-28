# Convert-it — Universal File Converter

**[Live Demo → convert-it.oilygold.xyz](https://convert-it.oilygold.xyz)**

A bold, modern web app for converting files between popular formats — entirely in the browser. Your files never leave your device: no uploads, no accounts.

[![ci](https://img.shields.io/github/actions/workflow/status/acchuang/convert-it/ci.yml?branch=main&label=ci%20%2B%20deploy&style=flat-square)](https://github.com/acchuang/convert-it/actions/workflows/ci.yml)
[![repo](https://img.shields.io/badge/source-github-blue?style=flat-square)](https://github.com/acchuang/convert-it)
[![issues](https://img.shields.io/github/issues/acchuang/convert-it?style=flat-square)](https://github.com/acchuang/convert-it/issues)

## Features

### Formats

- **Images**:
  - Read: JPG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, ICO, SVG, HEIC and TIFF.
  - Write: JPG, PNG, WebP, AVIF, JPEG XL, BMP and ICO.
  - Encoding goes through WASM codecs (mozjpeg, libpng + oxipng, libwebp, libavif, libjxl), not `canvas.toBlob`.
  - SVG is rendered by resvg with a bundled font.
  - HEIC converts the primary photo, or every image as a ZIP.
- **Video**:
  - Convert between MP4, WebM, MOV, MKV, AVI, FLV, M4V and 3GP.
  - Also read MPEG, VOB, MPEG-TS/M2TS, WMV/ASF and F4V.
  - Make GIF (with a proper palette) or animated WebP.
- **Audio**:
  - Convert between MP3, WAV, AAC, OGG, FLAC, M4A, WMA and Opus.
  - Also read AIFF, AC3, DTS, WavPack, CAF and AMR, and extract the audio from any video.
- **Documents**:
  - Convert between TXT, Markdown, HTML and Word (DOCX).
  - Typeset PDFs with proper headings, lists, tables and CJK fonts.
  - Export EPUB 3 that passes W3C epubcheck.
- **PDF**:
  - Pages to PNG/JPG/WebP (one page, or all of them as a ZIP at 1×/2×/3×), and text to TXT/HTML.
  - Pick, reorder, rotate and split pages, compress, turn any image into a PDF, and merge PDFs and images.
- **OCR**: images and scanned PDFs to text in 8 languages, with tesseract.js running in a worker.
- **Subtitles**: SRT ⇄ VTT, re-timing, a plain-text transcript, and burning subtitles into a video.
- **Data**: CSV ⇄ JSON ⇄ XML ⇄ YAML ⇄ TSV ⇄ HTML ⇄ Excel (XLSX, all sheets if you like). CSV and TSV are streamed.

### Tools and controls

- **Media editing**:
  - Trim and cut on a scrubber.
  - Resize or mute video.
  - Presets (including lossless video), with quality, CRF, bitrate and speed controls underneath.
- **Faster video**:
  - Many video conversions run on the browser's own codecs (WebCodecs), with no FFmpeg download.
  - The rest use FFmpeg WASM, and its multi-threaded build on capable machines.
- **Photo metadata**:
  - Stripped by default, so a photo's location doesn't travel with it.
  - "Keep" and "keep without GPS" options.
  - A report of what the file carries and what will be removed.
- **Batch work**:
  - Drop whole folders; "Download all" rebuilds them in the ZIP.
  - Name outputs with a template (`{name}`, `{n}`, `{date}`, `{w}x{h}`…).
  - "Apply to other .EXT files", and Undo for Remove and Clear.
- **Paste and copy**:
  - Paste files, screenshots, a spreadsheet range (as TSV), JSON or rich text.
  - Copy image results to the clipboard.
- **Before/after preview** for images, with sizes; text previews with copy.
- **Unsupported files explain themselves**:
  - A misnamed file is read as what it really is.
  - Anything else says what it is and what to export it as.
- **Installable app**:
  - Works offline once saved ("Save for offline use").
  - "Open with" from the desktop, and a share target on mobile.

### Privacy, by design

- **Every conversion runs in your browser.** Files are never uploaded.
- **Network badge**:
  - The service worker counts every byte the app sends and receives, and shows the totals live above the drop zone.
  - "Sent" stays at 0 B.
- **No analytics, tracking scripts or cookies.** Conversion stats (counts per format pair) are kept on your device only, and leave it only if you press "Copy report".
- **Stored locally only**: recent history (can be turned off, which deletes it), theme, language and name template, plus app files cached for offline use. The About page lists all of it.
- **Security**:
  - Strict CSP with hashed inline scripts, and cross-origin isolation.
  - The FFmpeg engine is self-hosted, and its hashes are checked before it runs.

### Quality bars

- **CI checks** on every push:
  - Type-check, lint, format, 860+ unit tests (several on the real codecs) and a dependency audit.
  - A browser smoke suite with real codecs, which fails on any CSP violation.
  - axe-core accessibility checks (WCAG 2.1 AA, both themes) and an offline test.
- **UI**: 5 languages (English, 繁體中文, 简体中文, 日本語, Español), dark/light themes that don't flash, keyboard focus rings and reduced-motion support.
- **Size limits**: 100MB images, 500MB video, 200MB audio, 50MB documents, 100MB data.

## Design

- **Aesthetic**: Dark brutalist with acid-green (#C8FF00) accents, flame (#FF4D00) for images, ice (#00C2FF) for documents
- **Fonts**: Bebas Neue (display) + DM Sans (body) + DM Mono (monospace)
- **Motion**: Framer Motion for card animations and status transitions

## Getting Started

```bash
git clone https://github.com/acchuang/convert-it.git
cd convert-it
npm install
cp .env.example .env.local   # then point NEXT_PUBLIC_FFMPEG_BASE_URL at your FFmpeg core host
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`NEXT_PUBLIC_FFMPEG_BASE_URL` must serve `ffmpeg-core.js` and `ffmpeg-core.wasm` from
`@ffmpeg/core@0.12.10/dist/umd`, with CORS allowing this app's origin. Video and audio
conversion throws without it; everything else works. It is inlined at build time, so
changing it requires a rebuild.

## Build for Production

```bash
npm run build
```

The static export is output to the `out/` directory. Deploy it to any static host (Cloudflare Pages, Vercel, Netlify, etc.).

## Deploying

The Cloudflare Pages project is **direct upload** — it is not connected to this Git repo, so
pushing alone builds nothing on Cloudflare's side. Pushing to `main` runs
[`ci.yml`](.github/workflows/ci.yml), which typechecks, lints, tests, builds, and then uploads
`out/` with `wrangler pages deploy`. It needs two repo secrets:

| Secret                  | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with **Account → Cloudflare Pages → Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | `d583c243261fbfe8d012005d5b59bfeb`                   |

To deploy by hand, build with `NEXT_PUBLIC_FFMPEG_BASE_URL` set — it is inlined at build
time, and a build without it ships an app whose audio/video conversion throws:

```bash
NEXT_PUBLIC_FFMPEG_BASE_URL=https://cdn.oilygold.xyz/ffmpeg-core/0.12.10 npm run build
npx wrangler pages deploy out --project-name convert-it --branch main
```

## Browser Tests

`npm test` covers the converters in isolation. The browser suites drive the real UI against
the built site, served with its production headers (`out/_headers`):

```bash
npm run fixtures   # writes .smoke-fixtures/ (once)
npm run build      # with NEXT_PUBLIC_FFMPEG_BASE_URL set, or the FFmpeg pairs fail
npm run serve      # port 3000; restart it after each build
npm run smoke      # one pair per engine; checks the output bytes, fails on CSP violations
npm run a11y       # axe-core, WCAG 2.1 AA, both themes
node scripts/offline-smoke.mjs   # service worker, with the server really stopped
```

Chrome is used via Playwright's `channel: 'chrome'`, so no browser download is needed. Set
`SMOKE_CHROMIUM_PATH` to use another Chromium. `npm run smoke webkit` runs on WebKit, after
`npx playwright install webkit`. Point the smoke suite at a deployed build with
`SMOKE_URL=https://… npm run smoke`.

## Hosting the FFmpeg Core

The FFmpeg core is ~31MB, which is over Cloudflare Pages' 25MiB per-file limit, so it
cannot live in `public/`. It is self-hosted on R2 instead — a third-party CDN would be
both a single point of failure and an unsigned-wasm supply-chain risk. To reprovision:

```bash
npm install --no-save @ffmpeg/core@0.12.10
npx wrangler r2 bucket create convert-it-assets
npx wrangler r2 object put convert-it-assets/ffmpeg-core/0.12.10/ffmpeg-core.js --file node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js --content-type text/javascript --remote
npx wrangler r2 object put convert-it-assets/ffmpeg-core/0.12.10/ffmpeg-core.wasm --file node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm --content-type application/wasm --remote
npx wrangler r2 bucket cors set convert-it-assets --file r2-cors.json
```

Then attach a custom domain — the `*.r2.dev` URL is rate-limited and unsuitable for
production. The zone ID is on the Cloudflare dashboard under the zone's Overview tab:

```bash
npx wrangler r2 bucket domain add convert-it-assets --domain cdn.oilygold.xyz --zone-id <zone-id>
```

Finally point `NEXT_PUBLIC_FFMPEG_BASE_URL` at the new domain in [`ci.yml`](.github/workflows/ci.yml),
which is where the deployed build gets it. It is inlined at build time, so this needs a redeploy
to take effect.

### Multi-threaded core

Every page is cross-origin isolated (COOP + COEP in `out/_headers`), so browsers can run
`@ffmpeg/core-mt`, which encodes video 2–3× faster on a 4-core machine. The app uses it
when `NEXT_PUBLIC_FFMPEG_MT_BASE_URL` is set and the device qualifies (isolated, 4+ cores,
4+ GB where the browser reports memory), and falls back to the single-threaded core if it
fails to load or crashes.

To put it on the CDN, run the **Upload multi-threaded FFmpeg core** workflow
([`upload-ffmpeg-mt.yml`](.github/workflows/upload-ffmpeg-mt.yml)) once from the Actions tab.
It checks the npm package against the hashes the app pins, uploads the three files to
`convert-it-assets/ffmpeg-core-mt/0.12.10/` (their own directory, since the names clash with
the single-threaded core's), and checks the CDN serves them. Its API token needs R2 edit
permission as well as Pages.

After that, CI turns it on by itself: before the build,
[`scripts/check-ffmpeg-mt.mjs`](scripts/check-ffmpeg-mt.mjs) checks that the CDN serves the
files with CORS and the pinned hashes. If it does, the build gets
`NEXT_PUBLIC_FFMPEG_MT_BASE_URL` and the smoke suite runs with `SMOKE_EXPECT_MT=1`, so a silent
fallback to the single-threaded core fails CI. If it doesn't, the site builds single-threaded.

Allowed origins live in [`r2-cors.json`](r2-cors.json) — a new deploy origin must be added
there and reapplied, or the core fetch fails in the browser while still working locally.

## Tech Stack

- **Next.js 15** (App Router, static export), **TypeScript** (strict), **Tailwind CSS**, **Framer Motion**
- **Video/audio**: WebCodecs + **mediabunny**, then **FFmpeg WASM** (single- or multi-threaded core, self-hosted on R2)
- **Images**: **jSquash** WASM codecs (mozjpeg, libpng, libwebp, libavif, libjxl), **oxipng**, **resvg-wasm**, **libheif-js**, **UTIF** (TIFF), **exifr** (metadata)
- **PDF**: **PDFium WASM** (render, text), **pdf-lib** (page tools), **jsPDF** with Noto font subsets (typesetting)
- **Documents**: **mammoth** (DOCX in), an in-house DOCX writer, **marked**, **Turndown**, an in-house EPUB 3 writer
- **OCR**: **tesseract.js**, self-hosted with its language data
- **Data**: **Papa Parse** (streaming), **fast-xml-parser**, **yaml**, and an in-house XLSX reader/writer on **JSZip**
- **Cloudflare Pages** for hosting and **R2** for the FFmpeg core. No analytics or tracking scripts.

## Adding More Formats

1. Add the format to `FORMATS` in `lib/formats.ts`: its extension, label, MIME type and category. Another spelling of an existing format gets `aliasOf`.
2. Add one `add(from, to, run, settings)` line per pair in `lib/converters.ts`. It is the single registry: `CONVERSION_MAP`, the target menus, the settings panel, the worker pool and the `/convert/*` pages all read it.
3. Put the conversion logic in the matching module under `lib/`.
4. Update the snapshot (`npx vitest run -u lib/__tests__/registry.test.ts`) and the manifest's `file_handlers` and `share_target` lists, which `manifest.test.ts` keeps in step with the registry.

See [`AGENTS.md`](AGENTS.md) for the contracts each engine follows.

## License

[MIT](https://github.com/acchuang/convert-it/blob/main/LICENSE)
