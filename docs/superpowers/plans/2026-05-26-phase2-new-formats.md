# Phase 2: New Formats — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HEIC decode, AVIF decode, ePub export, and animated WebP output. Lazy WASM for HEIC, zero new deps for AVIF/ePub/WebP.

**Architecture:** Three new converter modules (heic/avif/epub) with default exports, dispatched from `convertFile` before the generic image branch. Registry entries added to `FORMATS`, `IMAGE_CONVERSIONS`, `CONVERTER_REGISTRY`. WebP added to video codec pipeline with dedicated FFmpeg args. All converters are pure functions — easy to test in isolation.

**Tech Stack:** libheif-js (runtime dep, lazy), Canvas API, FFmpeg WASM (existing), JSZip (existing), Vitest

---

## Chunk 1: Registry Changes + ePub Converter + Tests

### Task 1.1: Add ePub export format entries

**Files:**
- Modify: `lib/converters.ts`

- [ ] **Step 1: Add ePub format entry**

In the `FORMATS` array at line 45 (after the `pdf` entry), add:

```typescript
  { ext: 'epub', label: 'ePub', mimeType: 'application/epub+zip', category: 'document' },
```

- [ ] **Step 2: Add ePub converter registry entries**

In the `CONVERTER_REGISTRY` at line 128, add after the last entry:

```typescript
  'txt:epub':  txtToEpub,
  'md:epub':   mdToEpub,
  'html:epub': htmlToEpub,
```

- [ ] **Step 3: Add ePub imports**

At the top of the file, add an import after the pdf-converters import (line 9):

```typescript
import { txtToEpub, mdToEpub, htmlToEpub } from './epub-converter';
```

- [ ] **Step 4: Verify format shows up**

Run: `node -e "const c = require('./lib/converters.ts');" 2>&1`
Expected: Fails (TypeScript). Run `npm run typecheck` instead:
Run: `npm run typecheck`
Expected: Fails — `Module './epub-converter' has no exported member 'txtToEpub'` (TDD! We'll create the converter next)

### Task 1.2: Install libheif-js (prerequisite for Chunk 2)

**Note:** This is installed now (Chunk 1) so it's available when Chunk 2 writes the HEIC converter. The installation belongs to Chunk 2's HEIC feature, but npm install must happen before the converter code is written.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install as runtime dependency**

```bash
npm install --save libheif-js --legacy-peer-deps
```

- [ ] **Step 2: Verify installed**

Run: `node -e "try { require.resolve('libheif-js'); console.log('OK'); } catch(e) { console.log('MISSING'); }"`
Expected: OK

### Task 1.3: Write ePub converter + tests (TDD)

**Files:**
- Create: `lib/epub-converter.ts`
- Create: `lib/__tests__/epub-converter.test.ts`

- [ ] **Step 1: Write failing test**

Write `lib/__tests__/epub-converter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { txtToEpub, mdToEpub, htmlToEpub } from '@/lib/epub-converter';
import JSZip from 'jszip';

async function unzip(blob: Blob): Promise<JSZip> {
  const buffer = await blob.arrayBuffer();
  return JSZip.loadAsync(buffer);
}

describe('txtToEpub', () => {
  it('produces valid ePub ZIP structure', async () => {
    const file = new File(['Hello world'], 'test.txt', { type: 'text/plain' });
    const blob = await txtToEpub(file, 'txt', 'epub');
    const zip = await unzip(blob);

    const mimetype = await zip.file('mimetype')!.async('text');
    expect(mimetype).toBe('application/epub+zip');

    const container = await zip.file('META-INF/container.xml')!.async('text');
    expect(container).toContain('OEBPS/content.opf');

    const opf = await zip.file('OEBPS/content.opf')!.async('text');
    expect(opf).toContain('<dc:title>test</dc:title>');
    expect(opf).toContain('chapter.xhtml');

    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('Hello world');
  });
});

describe('mdToEpub', () => {
  it('converts markdown to XHTML body', async () => {
    const file = new File(['# Title\n\nParagraph'], 'doc.md', { type: 'text/markdown' });
    const blob = await mdToEpub(file, 'md', 'epub');
    const zip = await unzip(blob);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('<h1>Title</h1>');
    expect(chapter).toContain('<p>Paragraph</p>');
  });
});

describe('htmlToEpub', () => {
  it('wraps HTML as XHTML body', async () => {
    const file = new File(['<p>Hello</p>'], 'page.html', { type: 'text/html' });
    const blob = await htmlToEpub(file, 'html', 'epub');
    const zip = await unzip(blob);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('text');
    expect(chapter).toContain('<p>Hello</p>');
  });
});
```

Run: `npx vitest run lib/__tests__/epub-converter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement ePub converter**

Write `lib/epub-converter.ts`:

```typescript
import JSZip from 'jszip';
import { marked } from 'marked';

function getFilename(file: File): string {
  const dotIdx = file.name.lastIndexOf('.');
  return dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function wrapXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>${escapeXml(title)}</title></head>
<body>${body}</body>
</html>`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function opfXml(title: string, id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="book-id">urn:uuid:${id}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().split('T')[0]}</meta>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function buildEpub(title: string, body: string): Promise<Blob> {
  const zip = new JSZip();
  const id = generateUuid();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', containerXml());
  const oebps = zip.folder('OEBPS')!;
  oebps.file('content.opf', opfXml(title, id));
  oebps.file('chapter.xhtml', wrapXhtml(title, body));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

export async function txtToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const text = await file.text();
  const body = `<pre>${escapeXml(text)}</pre>`;
  return buildEpub(getFilename(file), body);
}

export async function mdToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const md = await file.text();
  const body = await marked.parse(md, { async: false });
  return buildEpub(getFilename(file), body);
}

export async function htmlToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const html = await file.text();
  return buildEpub(getFilename(file), html);
}
```

- [ ] **Step 3: Run ePub tests**

Run: `npx vitest run lib/__tests__/epub-converter.test.ts`
Expected: All 3 tests pass

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: Pass (ePub converter + registry changes are consistent)

- [ ] **Step 5: Commit**

```bash
git add lib/epub-converter.ts lib/__tests__/epub-converter.test.ts lib/converters.ts package.json package-lock.json
git commit -m "feat: add ePub export (txt/md/html to ePub)"
```

---

## Chunk 2: HEIC + AVIF Converters + Tests

### Task 2.1: Write HEIC converter + tests (TDD)

**Files:**
- Create: `lib/heic-converter.ts`
- Create: `lib/__tests__/heic-converter.test.ts`

- [ ] **Step 1: Write failing test**

Write `lib/__tests__/heic-converter.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import convertHeic from '@/lib/heic-converter';

describe('convertHeic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts HEIC to JPEG', async () => {
    const mockDecode = vi.fn().mockResolvedValue({
      get_width: () => 100,
      get_height: () => 100,
      display: vi.fn().mockImplementation((imageData: ImageData) => {
        imageData.data.set(new Uint8Array(40000).fill(128));
      }),
    });

    vi.mock('libheif-js', () => ({
      default: {
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: mockDecode,
        })),
      },
    }));

    const blob = new Blob(['fake-heic-data'], { type: 'image/heic' });
    const file = new File([blob], 'test.heic', { type: 'image/heic' });
    const result = await convertHeic(file, 'jpg', { quality: 0.9 } as any);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts HEIC to ICO', async () => {
    const mockDecode = vi.fn().mockResolvedValue({
      get_width: () => 64,
      get_height: () => 64,
      display: vi.fn().mockImplementation((imageData: ImageData) => {
        imageData.data.set(new Uint8Array(16384).fill(128));
      }),
    });

    vi.mock('libheif-js', () => ({
      default: {
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: mockDecode,
        })),
      },
    }));

    const blob = new Blob(['fake-heic-data'], { type: 'image/heic' });
    const file = new File([blob], 'test.heic', { type: 'image/heic' });
    const result = await convertHeic(file, 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });

  it('throws on corrupt HEIC', async () => {
    vi.mock('libheif-js', () => ({
      default: {
        HeifDecoder: vi.fn().mockImplementation(() => ({
          decode: vi.fn().mockRejectedValue(new Error('corrupt')),
        })),
      },
    }));

    const file = new File(['bad-data'], 'corrupt.heic', { type: 'image/heic' });
    await expect(convertHeic(file, 'png')).rejects.toThrow('HEIC decode failed');
  });
});
```

Run: `npx vitest run lib/__tests__/heic-converter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement HEIC converter**

Write `lib/heic-converter.ts`:

```typescript
import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { IMAGE_MIME_MAP } from './image-converters';

function rasterizeToTarget(
  source: HTMLImageElement,
  targetExt: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  if (['jpg', 'jpeg', 'bmp'].includes(targetExt)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0);

  const mimeType = IMAGE_MIME_MAP[targetExt] ?? 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      mimeType,
      quality
    );
  });
}

export default async function convertHeic(
  file: File,
  targetExt: string,
  settings?: ConversionSettings
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  const libheif = await import('libheif-js');
  const data = new Uint8Array(await file.arrayBuffer());
  const decoder = new libheif.default.HeifDecoder();

  let image: any;
  try {
    const images = decoder.decode(data);
    if (!images.length) throw new Error('no images in HEIC file');
    image = images[0];
  } catch (err) {
    throw new Error(`HEIC decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  const width = image.get_width();
  const height = image.get_height();
  const imageData = new ImageData(width, height);
  await image.display(imageData, () => {});

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);

  const tempBlob = await new Promise<Blob>((resolve, reject) => {
    tempCanvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
  });

  const url = URL.createObjectURL(tempBlob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('temp image load failed'));
    el.src = url;
  });
  URL.revokeObjectURL(url);

  if (targetExt === 'ico') {
    const pngBlob = await rasterizeToTarget(img, 'png', 1);
    const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());
    return encodeIcoBlob([{ size: Math.min(width, 256), data: pngBuffer }]);
  }

  return rasterizeToTarget(img, targetExt, quality);
}
```

- [ ] **Step 2.5: Export IMAGE_MIME_MAP from image-converters**

In `lib/image-converters.ts`, change line 4 from:
```typescript
const IMAGE_MIME_MAP: Record<string, string> = {
```
to:
```typescript
export const IMAGE_MIME_MAP: Record<string, string> = {
```

Run: `npm run typecheck`
Expected: Pass

- [ ] **Step 3: Run HEIC tests**

Run: `npx vitest run lib/__tests__/heic-converter.test.ts`
Expected: All 3 tests pass

### Task 2.2: Write AVIF converter + tests (TDD)

**Files:**
- Create: `lib/avif-converter.ts`
- Create: `lib/__tests__/avif-converter.test.ts`

- [ ] **Step 1: Write failing test**

Write `lib/__tests__/avif-converter.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import convertAvif from '@/lib/avif-converter';

describe('convertAvif', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts AVIF to PNG', async () => {
    const bitmap = {
      width: 10,
      height: 10,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.spyOn(globalThis, 'createImageBitmap').mockResolvedValue(bitmap);

    const file = new File(['fake-avif'], 'test.avif', { type: 'image/avif' });
    const result = await convertAvif(file, 'png');
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts AVIF to ICO', async () => {
    const bitmap = {
      width: 64,
      height: 64,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.spyOn(globalThis, 'createImageBitmap').mockResolvedValue(bitmap);

    const file = new File(['fake-avif'], 'test.avif', { type: 'image/avif' });
    const result = await convertAvif(file, 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });

  it('rejects on corrupt AVIF', async () => {
    vi.spyOn(globalThis, 'createImageBitmap').mockRejectedValue(new Error('corrupt'));
    const file = new File(['bad'], 'bad.avif', { type: 'image/avif' });
    await expect(convertAvif(file, 'png')).rejects.toThrow('AVIF decode failed');
  });
});
```

Run: `npx vitest run lib/__tests__/avif-converter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement AVIF converter**

Write `lib/avif-converter.ts`:

```typescript
import type { ConversionSettings } from './types';
import { encodeIcoBlob } from 'ico-codec';
import { IMAGE_MIME_MAP } from './image-converters';

function rasterizeBitmap(
  bitmap: ImageBitmap,
  targetExt: string,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;

  if (['jpg', 'jpeg', 'bmp'].includes(targetExt)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);

  const mimeType = IMAGE_MIME_MAP[targetExt] ?? 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      mimeType,
      quality
    );
  });
}

export default async function convertAvif(
  file: File,
  targetExt: string,
  settings?: ConversionSettings
): Promise<Blob> {
  const quality = settings?.quality ?? 0.92;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(`AVIF decode failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  if (targetExt === 'ico') {
    const pngBlob = await rasterizeBitmap(bitmap, 'png', 1);
    const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());
    const result = encodeIcoBlob([{ size: Math.min(bitmap.width, 256), data: pngBuffer }]);
    bitmap.close();
    return result;
  }

  const result = await rasterizeBitmap(bitmap, targetExt, quality);
  bitmap.close();
  return result;
}
```

- [ ] **Step 3: Run AVIF tests**

Run: `npx vitest run lib/__tests__/avif-converter.test.ts`
Expected: All 3 tests pass

### Task 2.3: Add HEIC + AVIF to dispatch + registry

**Files:**
- Modify: `lib/converters.ts`

- [ ] **Step 1: Add HEIC + AVIF format entries**

In `FORMATS` array after the svg entry (line 22), add:

```typescript
  { ext: 'heic', label: 'HEIC', mimeType: 'image/heic', category: 'image' },
  { ext: 'avif', label: 'AVIF', mimeType: 'image/avif', category: 'image' },
```

- [ ] **Step 2: Add IMAGE_CONVERSIONS entries**

In `IMAGE_CONVERSIONS` after the svg entry (line 63), add:

```typescript
  heic: ['jpg', 'png', 'webp', 'bmp', 'ico'],
  avif: ['jpg', 'png', 'webp', 'bmp', 'ico'],
```

- [ ] **Step 3: Add imports and dispatch**

At the top of file, add imports after line 6:

```typescript
import convertHeic from './heic-converter';
import convertAvif from './avif-converter';
```

In `convertFile`, after `const sourceExt = getFileExtension(file.name);` (line 174) and before `const category = getFormatInfo(sourceExt)?.category;` (line 175), add:

```typescript
  if (sourceExt === 'heic') return convertHeic(file, targetExt, settings);
  if (sourceExt === 'avif') return convertAvif(file, targetExt, settings);
```

- [ ] **Step 4: Run all checks**

```bash
npm run typecheck && npm run test && npm run lint 2>&1
```

Expected: Typecheck passes, all tests pass (existing 20 + 6 new = 26), lint passes on new files

- [ ] **Step 5: Commit**

```bash
git add lib/heic-converter.ts lib/avif-converter.ts lib/__tests__/heic-converter.test.ts lib/__tests__/avif-converter.test.ts lib/converters.ts
git commit -m "feat: add HEIC and AVIF decode support"
```

---

## Chunk 3: Animated WebP Output

### Task 3.1: Add animated WebP support to video pipeline + tests

**Files:**
- Modify: `lib/audio-video-converters.ts`
- Create: `lib/__tests__/audio-video-converters.test.ts`

- [ ] **Step 1: Write failing test**

Write `lib/__tests__/audio-video-converters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getTargetFormats } from '@/lib/converters';

describe('VIDEO_CONVERSIONS includes webp', () => {
  const videoSources = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v', '3gp'];
  for (const source of videoSources) {
    it(`${source} can convert to webp`, () => {
      const targets = getTargetFormats(source);
      expect(targets).toContain('webp');
    });
  }
});
```

Run: `npx vitest run lib/__tests__/audio-video-converters.test.ts`
Expected: 8 tests, all FAIL (webp not in conversion map yet)

- [ ] **Step 2: Add webp to VIDEO_CONVERSIONS**

In `lib/converters.ts`, add `'webp'` to each video source array in `VIDEO_CONVERSIONS` (lines 66-75). Add it to all entries: mp4, webm, avi, mov, mkv, flv, m4v, 3gp.

Each entry changes from e.g.:
```typescript
  mp4: ['webm', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg'],
```
to:
```typescript
  mp4: ['webm', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'webp'],
```

Apply the same `webp` addition to ALL 8 video source entries.

- [ ] **Step 3: Run conversion map test**

Run: `npx vitest run lib/__tests__/audio-video-converters.test.ts`
Expected: Both tests pass

- [ ] **Step 4: Add webp codec + mime type + dedicated args**

In `lib/audio-video-converters.ts`:

Add webp to `VIDEO_CODECS` (after flv entry at line 41):

```typescript
  webp: { codec: 'libwebp', ext: 'webp' },
```

In the if/else chain after `args` is declared (line 91), modify the video branch at lines 93-105 to add a nested check for webp. Replace lines 93-105 with:

```typescript
  if (category === 'video' && VIDEO_CODECS[targetExt]) {
    const config = VIDEO_CODECS[targetExt];

    if (targetExt === 'webp') {

args.push(
        '-i', inputName,
        '-c:v', 'libwebp',
        '-loop', '0',
        '-lossless', '0',
        '-q:v', '75',
        '-an',
        '-y', outputName
      );
    } else {
      args.push(
        '-i', inputName,
        '-c:v', config.codec,
        '-preset', settings?.videoPreset || 'medium',
        '-crf', String(settings?.videoQuality || 23),
        '-c:a', 'aac',
        '-b:a', `${settings?.audioBitrate || 128}k`,
        '-movflags', '+faststart',
        '-y', outputName
      );
    }
```

In the `mimeTypes` object at line 129, add:

```typescript
    webp: 'image/webp',
```

- [ ] **Step 5: Run all checks**

```bash
npm run typecheck && npm run test && npm run build
```

Expected: Typecheck passes, all 28 tests pass, build succeeds

- [ ] **Step 6: Commit**

```bash
git add lib/audio-video-converters.ts lib/__tests__/audio-video-converters.test.ts lib/converters.ts
git commit -m "feat: add animated WebP output support"
```

---

## Chunk 4: Final Verification

### Task 4.1: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: All tests pass (should be 28 total: 17 existing + 3 ePub + 3 HEIC + 3 AVIF + 2 WebP = 28)

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: Pass

- [ ] **Step 3: Run lint on new files**

```bash
npx eslint lib/heic-converter.ts lib/avif-converter.ts lib/epub-converter.ts lib/__tests__/
```

Expected: Pass

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: Build succeeds, `out/` directory created

- [ ] **Step 5: Check git status**

```bash
git status
```

Expected: Clean working tree
