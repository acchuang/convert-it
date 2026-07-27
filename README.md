# Convert-it — Universal File Converter

**[Live Demo → convert-it.oilygold.xyz](https://convert-it.oilygold.xyz)**

A bold, modern web app for converting files between popular formats — entirely in the browser. Your files never leave your device: no uploads, no accounts.

[![deploy](https://img.shields.io/github/deployments/acchuang/convert-it/production?label=cloudflare%20pages&style=flat-square)](https://convert-it.oilygold.xyz)
[![repo](https://img.shields.io/badge/source-github-blue?style=flat-square)](https://github.com/acchuang/convert-it)
[![issues](https://img.shields.io/github/issues/acchuang/convert-it?style=flat-square)](https://github.com/acchuang/convert-it/issues)

## Features

- **Image conversions**: JPG ↔ PNG ↔ WebP ↔ BMP ↔ ICO ↔ GIF ↔ SVG (canvas-based), plus **HEIC** and **AVIF** decode
- **Video conversions**: MP4 ↔ WebM ↔ AVI ↔ MOV ↔ MKV ↔ FLV, plus **animated WebP** output (FFmpeg WASM)
- **Audio conversions**: MP3 ↔ WAV ↔ AAC ↔ OGG ↔ FLAC ↔ M4A ↔ OPUS (FFmpeg WASM)
- **Audio extraction**: Extract audio tracks from video files
- **Data conversions**: CSV ↔ JSON ↔ XML ↔ YAML ↔ TSV ↔ HTML ↔ Excel
- **Document conversions**: TXT ↔ Markdown ↔ HTML ↔ PDF, plus **ePub export**
- **Configurable settings**: Quality, bitrate, CRF, delimiter, indentation per conversion
- **Drag & drop** with auto-detection of file category
- **Batch conversion** — convert all files at once with bulk format selector
- **Real-time progress** tracking for FFmpeg-based conversions
- **Preview panel** for text and image results with copy-to-clipboard
- **Conversion history** persisted in localStorage
- **Dark/light theme** with system preference detection, applied before first paint so there is no flash
- **i18n support** — English, 繁體中文, 简体中文, 日本語, Español
- **Degrades, doesn't crash** — with browser storage blocked, theme, language, and history fall back to memory for the session
- **File size limits** with early rejection (100MB images, 500MB video, 200MB audio)
- **Download all as ZIP** for batch results
- **PWA-ready** with manifest and app icons
- **Accessibility**: ARIA labels, focus-visible rings, reduced-motion support
- **Error boundary** — caught errors show a fallback UI instead of a white screen
- **No analytics, no tracking scripts, no cookies** — the only things stored on your device are your theme and language preferences
- **Client-side conversion** — your files never leave your browser. The only network traffic is the app itself plus a one-time ~31MB FFmpeg engine download (self-hosted on R2) the first time you convert video or audio.

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

## Smoke Test

`npm test` covers the converters in isolation; the smoke run drives one pair per engine
through the real UI in a real browser and checks the downloaded bytes. Needs a dev server
running and `NEXT_PUBLIC_FFMPEG_BASE_URL` set, or the two ffmpeg pairs fail.

```bash
npm run fixtures   # writes .smoke-fixtures/ (once)
npm run smoke      # system Chrome
npm run smoke webkit
```

Chrome is used via Playwright's `channel: 'chrome'`, so no browser download is needed.
WebKit is not installed by default — run `npx playwright install webkit` first. Point the
run at a deployed build with `SMOKE_URL=https://… npm run smoke`.

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

Finally set `NEXT_PUBLIC_FFMPEG_BASE_URL=https://cdn.oilygold.xyz/ffmpeg-core/0.12.10` in the
Pages build environment. It is inlined at build time, so this needs a redeploy to take effect.

Allowed origins live in [`r2-cors.json`](r2-cors.json) — a new deploy origin must be added
there and reapplied, or the core fetch fails in the browser while still working locally.

## Tech Stack

- **Next.js 15** (App Router, static export)
- **TypeScript** (strict, zero type assertions)
- **Tailwind CSS** with CSS custom properties for theming
- **Framer Motion** for animations
- **FFmpeg WASM** for video/audio conversions
- **Canvas API** for image conversions (Canvas + HEIC WASM + AVIF native decode)
- **SheetJS** for Excel read/write
- **JSZip** for batch downloads and ePub generation
- **Cloudflare Pages** for static hosting, **R2** for the self-hosted FFmpeg core — no analytics or tracking scripts

## Adding More Formats

Edit `lib/converters.ts`:
1. Add your format to the `FORMATS` array
2. Add the converter function to `CONVERTER_REGISTRY` (key format: `sourceExt:targetExt`)
3. `CONVERSION_MAP` is auto-generated from the registry — no manual sync needed
4. Add conversion logic in the appropriate converter module (`lib/*.ts`)

## License

[MIT](https://github.com/acchuang/convert-it/blob/main/LICENSE)