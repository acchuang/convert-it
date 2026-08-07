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
- Sync jSquash wasm assets: `npm run copy-wasm` (run after install or upgrading `@jsquash/*`; copies codec `.wasm` files from `node_modules` into `public/wasm/`). Files are committed, not gitignored.

## Image Encode (WASM)

- Image output (JPEG/PNG/WebP) is encoded via `@jsquash/*` WASM codecs (mozjpeg/libpng/libwebp), not `canvas.toBlob`. Shared helper: `lib/image-encode.ts`.
- BMP output keeps `canvas.toBlob` (no jSquash codec). ICO output uses `ico-codec` over PNG bytes from `@jsquash/png`.
- Decode stays native: `createImageBitmap` (AVIF), `HTMLImageElement` (raster/SVG), `libheif-js` (HEIC).
- Codec `.wasm` files live under `public/wasm/` and are lazy-fetched at runtime via `NEXT_PUBLIC_ASSET_BASE` (default `/wasm`), mirroring the `NEXT_PUBLIC_FFMPEG_BASE_URL` + R2 pattern used for FFmpeg core. They are small (~1 MB total), so unlike FFmpeg they ship from the static export, not R2.

## Child DOX Index

| Path | Purpose |
|---|---|
| `lib/` | Core conversion logic and utilities |
