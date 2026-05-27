# Phase 2: New Formats (HEIC, AVIF, ePub, Animated WebP)

## Goal

Add support for HEIC decode, AVIF decode, ePub export, and animated WebP output. No new dependencies for ePub/animated WebP. Lazy-loaded WASM for HEIC.

## Items

### 1. HEIC Decode (Source Only)

**New files:**
- `lib/heic-converter.ts` — default export: `export default function convertHeic(file, targetExt, settings?) → Promise<Blob>`
- `lib/__tests__/heic-converter.test.ts`

**Strategy:**
- Use `libheif-js` as a runtime dependency, lazy-loaded via `await import('libheif-js')`
- Decode → `ImageData`. Draw `ImageData` onto a temp canvas via `putImageData`, then convert to `HTMLImageElement` via canvas.toBlob → object URL → new Image. Then reuse `rasterizeImage` from `lib/image-converters.ts` for JPG/PNG/WebP/BMP encoding. Design rationale: avoids duplicating the JPG/PNG/WebP/BMP encode logic already tested in `convertImage`. The extra canvas pass adds negligible memory/performance cost.
- ICO target: rasterize to PNG first, then call `encodeIcoBlob` from `ico-codec`
- Error handling: if dynamic import fails or WASM decode fails, throw `new Error('HEIC decode failed: ...')`. Let errors propagate naturally to the caller — the JobCard error state handles display.

**Conversions:** HEIC → JPG, PNG, WebP, BMP, ICO

**Registry changes:**
- `FORMATS`: add `{ ext: 'heic', label: 'HEIC', mimeType: 'image/heic', category: 'image' }`
- `IMAGE_CONVERSIONS`: add `heic: ['jpg', 'png', 'webp', 'bmp', 'ico']`

### 2. AVIF Decode (Source Only)

**New files:**
- `lib/avif-converter.ts` — default export: `export default function convertAvif(file, targetExt, settings?) → Promise<Blob>`
- `lib/__tests__/avif-converter.test.ts`

**Strategy:**
- `const bitmap = await createImageBitmap(blob)` — native in Chrome 85+, Firefox 93+, Safari 16.4+, Edge 85+
- Draw bitmap to canvas. JPG/PNG/WebP/BMP: inline `canvas.toBlob(mimeType, quality)`. ICO: rasterize to PNG first, then call `encodeIcoBlob`. Do NOT reuse `rasterizeImage` (different shape from `HTMLImageElement`).
- Error handling: if `createImageBitmap` throws (unsupported browser, corrupt file), let the error propagate naturally. JobCard error state handles display.

**Conversions:** AVIF → JPG, PNG, WebP, BMP, ICO

**Registry changes:**
- `FORMATS`: add `{ ext: 'avif', label: 'AVIF', mimeType: 'image/avif', category: 'image' }`
- `IMAGE_CONVERSIONS`: add `avif: ['jpg', 'png', 'webp', 'bmp', 'ico']`

### 3. Animated WebP Output

**Files modified:**
- `lib/audio-video-converters.ts`

**Changes in `convertAudioVideo` function (`convertAudioVideo` at line ~93):**
- In the if/else chain, after `if (category === 'video' && VIDEO_CODECS[targetExt])` at line 93, add a nested check at the start of that block:
  ```ts
  if (targetExt === 'webp') {
    // animated WebP: video-only, no audio
    args.push('-i', inputName, '-c:v', 'libwebp', '-loop', '0', '-lossless', '0', '-q:v', '75', '-an', '-y', outputName);
  } else {
    // existing x264 path: -preset -crf -c:a aac -movflags
  }
  ```
- `VIDEO_CODECS`: add `webp: { codec: 'libwebp', ext: 'webp' }`
- `mimeTypes`: add `webp: 'image/webp'`
- `VIDEO_CONVERSIONS` in `lib/converters.ts`: add `'webp'` to all entries: mp4, webm, avi, mov, mkv, flv, m4v, 3gp

### 4. Dispatch Integration

**File modified:**
- `lib/converters.ts`

In `convertFile`, before the `category === 'image'` block (line ~177):
```ts
import convertHeic from './heic-converter';
import convertAvif from './avif-converter';

// ...
if (sourceExt === 'heic') return convertHeic(file, targetExt, settings);
if (sourceExt === 'avif') return convertAvif(file, targetExt, settings);
```

Static imports (not dynamic) — HEIC WASM is lazy-loaded inside `convertHeic` itself.

### 5. ePub Export

**New files:**
- `lib/epub-converter.ts` — named exports: `txtToEpub`, `mdToEpub`, `htmlToEpub` (matching pattern of `txtToPdf`, `mdToPdf`, `htmlToPdf` in pdf-converter.ts)
- `lib/__tests__/epub-converter.test.ts`

**Strategy:**
- Uses existing `jszip` dependency — no new packages
- ePub ZIP structure:
  - `mimetype` — literal `application/epub+zip` (must be uncompressed, first entry)
  - `META-INF/container.xml` — `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>`
  - `OEBPS/content.opf` — metadata (`dc:title` = source filename without extension, `dc:language` = `en`, `dc:identifier` = generated UUID), manifest (list of all contained files), spine (reading order). Hardcoded metadata, no configurable fields — YAGNI.
  - `OEBPS/chapter.xhtml` — the content body
- TXT → wrap in `<html><body><pre>...</pre></body></html>`
- MD → `marked` → XHTML body
- HTML → wrap as XHTML body

**Conversions:** TXT → ePub, MD → ePub, HTML → ePub

**Registry changes:**
- `FORMATS`: add `{ ext: 'epub', label: 'ePub', mimeType: 'application/epub+zip', category: 'document' }`
- `CONVERTER_REGISTRY`: add `'txt:epub': txtToEpub`, `'md:epub': mdToEpub`, `'html:epub': htmlToEpub`

## Files Changed

```
package.json                         (edit — add libheif-js dep)
lib/heic-converter.ts                (new)
lib/avif-converter.ts                (new)
lib/epub-converter.ts                (new)
lib/converters.ts                    (edit — formats, maps, dispatch heic/avif, webp)
lib/audio-video-converters.ts        (edit — webp codec, mime type, args branch)
lib/__tests__/heic-converter.test.ts          (new)
lib/__tests__/avif-converter.test.ts          (new)
lib/__tests__/epub-converter.test.ts          (new)
lib/__tests__/audio-video-converters.test.ts  (new — verify webp codec dispatch)
```

## Acceptance Criteria
- `npm run typecheck` passes
- `npm run lint` passes on new files
- `npm run test` passes (all tests green)
- `npm run build` succeeds
- HEIC file → JPG/PNG/WebP/BMP/ICO targets shown, conversion succeeds
- AVIF file → JPG/PNG/WebP/BMP/ICO targets shown, conversion succeeds
- Video file → WebP target produces animated WebP
- TXT → ePub produces valid ZIP with mimetype, container, OPF, XHTML chapter
- HEIC WASM only loads on first HEIC conversion (lazy)
