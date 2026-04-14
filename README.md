# CONVERT — Universal File Converter

**[Live Demo → convert-it.pages.dev](https://convert-it.pages.dev)**

A bold, modern web app for converting files between popular formats — entirely in the browser. No uploads, no server, no signup.

[![deploy](https://img.shields.io/github/deployments/acchuang/convert-it/production?label=cloudflare%20pages&style=flat-square)](https://convert-it.pages.dev)
[![repo](https://img.shields.io/badge/source-github-blue?style=flat-square)](https://github.com/acchuang/convert-it)
[![issues](https://img.shields.io/github/issues/acchuang/convert-it?style=flat-square)](https://github.com/acchuang/convert-it/issues)

## Features

- **Image conversions**: JPG ↔ PNG ↔ WebP ↔ BMP ↔ ICO (canvas-based)
- **Data conversions**: CSV ↔ JSON ↔ XML ↔ YAML ↔ TSV ↔ HTML
- **Document conversions**: TXT ↔ Markdown ↔ HTML
- Drag & drop or file picker
- Batch conversion — convert all files at once
- Progress indicators per file
- One-click download of converted files
- 100% client-side — your files never leave your browser

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
- **TypeScript**
- **Tailwind CSS**
- **Framer Motion**
- **Canvas API** for image conversions
- **Pure JS** parsers for data/text formats

## Adding More Formats

Edit `lib/converters.ts`:
1. Add your format to the `FORMATS` array
2. Add its conversion targets to `CONVERSION_MAP`
3. Add conversion logic in `convertImage` or `convertText`

## License

[MIT](https://github.com/acchuang/convert-it/blob/main/LICENSE)