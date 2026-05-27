# Convert-it — Universal File Converter

**[Live Demo → convert-it.oilygold.xyz](https://convert-it.oilygold.xyz)**

A bold, modern web app for converting files between popular formats — entirely in the browser. No uploads, no server, no signup.

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
- **Dark/light theme** with system preference detection
- **i18n support** — English, 繁體中文, 简体中文, 日本語, Español
- **File size limits** with early rejection (100MB images, 2GB video, 500MB audio)
- **Download all as ZIP** for batch results
- **PWA-ready** with manifest and app icons
- **Accessibility**: ARIA labels, focus-visible rings, reduced-motion support
- **Error boundary** — caught errors show a fallback UI instead of a white screen
- **100% client-side** — your files never leave your browser

## Design

- **Aesthetic**: Dark brutalist with acid-green (#C8FF00) accents, flame (#FF4D00) for images, ice (#00C2FF) for documents
- **Fonts**: Bebas Neue (display) + DM Sans (body) + DM Mono (monospace)
- **Motion**: Framer Motion for card animations and status transitions

## Getting Started

```bash
git clone https://github.com/acchuang/convert-it.git
cd convert-it
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build for Production

```bash
npm run build
```

The static export is output to the `out/` directory. Deploy it to any static host (Cloudflare Pages, Vercel, Netlify, etc.).

## Tech Stack

- **Next.js 15** (App Router, static export)
- **TypeScript** (strict, zero type assertions)
- **Tailwind CSS** with CSS custom properties for theming
- **Framer Motion** for animations
- **FFmpeg WASM** for video/audio conversions
- **Canvas API** for image conversions (Canvas + HEIC WASM + AVIF native decode)
- **SheetJS** for Excel read/write
- **JSZip** for batch downloads and ePub generation
- **Cloudflare Pages Functions + KV** for anonymous visitor stats

## Adding More Formats

Edit `lib/converters.ts`:
1. Add your format to the `FORMATS` array
2. Add the converter function to `CONVERTER_REGISTRY` (key format: `sourceExt:targetExt`)
3. `CONVERSION_MAP` is auto-generated from the registry — no manual sync needed
4. Add conversion logic in the appropriate converter module (`lib/*.ts`)

## License

[MIT](https://github.com/acchuang/convert-it/blob/main/LICENSE)