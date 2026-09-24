// PDF tools on pdf-lib (MIT): pick, reorder, rotate and split pages, compress,
// put images on pages, and merge several files into one. Pure JS, no DOM, so
// all of it runs in the worker pool; only "compress" needs PDFium to render.

import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import type { ConversionSettings } from './types';
import { ConversionError } from './errors';
import { getFileExtension } from './formats';
import { decodeJxl, decodeToImageData, encodeImageData } from './image-encode';
import { safeFileStem } from './filenames';
import { canMerge, parsePageRange } from './pdf-options';

async function loadPdf(file: Blob): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypted/i.test(message)) {
      throw new ConversionError(
        'unsupported',
        `Password-protected PDFs aren't supported: ${message}`,
      );
    }
    throw new ConversionError('corrupt-input', `Failed to load document: ${message}`);
  }
}

function rotate(page: PDFPage, by: number) {
  if (by % 360) page.setRotation(degrees((page.getRotation().angle + by + 360) % 360));
}

async function save(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

// --- Images on pages ----------------------------------------------------------------

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};
const MARGIN = 36; // half an inch
const PX_TO_PT = 72 / 96; // images are taken as 96 dpi

/** Bytes pdf-lib can embed as they are (JPEG, PNG), or re-encoded to one of them. */
async function embeddable(file: File): Promise<{ bytes: Uint8Array; kind: 'jpg' | 'png' }> {
  const ext = getFileExtension(file.name);
  if (ext === 'jpg' || ext === 'jpeg')
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: 'jpg' };
  if (ext === 'png') return { bytes: new Uint8Array(await file.arrayBuffer()), kind: 'png' };
  const image = await decodeAnyImage(file, ext);
  // Opaque images as JPEG (a photo as PNG is several times larger); anything
  // with transparency as PNG, which keeps it.
  let opaque = true;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const kind = opaque ? 'jpg' : 'png';
  const blob = await encodeImageData(image, kind, 0.92);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind };
}

async function decodeAnyImage(file: File, ext: string): Promise<ImageData> {
  if (ext === 'jxl') return decodeJxl(file);
  if (ext === 'svg') {
    const { renderSvgToImageData } = await import('./image-converters');
    return renderSvgToImageData(await file.text());
  }
  if (ext === 'heic') {
    const { decodeHeicToImageData } = await import('./heic-converter');
    return decodeHeicToImageData(file);
  }
  return decodeToImageData(file);
}

/** Adds one page holding the image: its own size, or fitted onto A4/Letter. */
async function addImagePage(doc: PDFDocument, file: File, pageSize: string) {
  const { bytes, kind } = await embeddable(file);
  const image = kind === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const natural = { width: image.width * PX_TO_PT, height: image.height * PX_TO_PT };
  const paper = PAGE_SIZES[pageSize];
  if (!paper) {
    doc.addPage([natural.width, natural.height]).drawImage(image, { x: 0, y: 0, ...natural });
    return;
  }
  // Landscape paper for landscape images.
  const [w, h] = natural.width > natural.height ? [paper[1], paper[0]] : paper;
  const scale = Math.min(1, (w - 2 * MARGIN) / natural.width, (h - 2 * MARGIN) / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  doc.addPage([w, h]).drawImage(image, { x: (w - width) / 2, y: (h - height) / 2, width, height });
}

// --- Converters ----------------------------------------------------------------------

/** image → PDF: one page. */
export async function imageToPdf(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  try {
    await addImagePage(doc, file, settings?.pdfPageSize ?? 'a4');
  } catch (err) {
    if (err instanceof ConversionError) throw err;
    throw new ConversionError('corrupt-input', err instanceof Error ? err.message : String(err));
  }
  onProgress?.(90);
  return save(doc);
}

// Compress by re-rendering each page as a JPEG: the only way to shrink a PDF
// that is mostly scanned or photographic pages, and it makes text
// unselectable, so it is opt-in. Kept only if it actually made the file smaller.
const COMPRESSION: Record<string, { scale: number; quality: number }> = {
  medium: { scale: 150 / 72, quality: 0.75 },
  strong: { scale: 100 / 72, quality: 0.6 },
};

async function rasterise(
  file: File,
  pages: number[],
  sizes: { width: number; height: number }[],
  rotation: number,
  level: { scale: number; quality: number },
  onProgress?: (pct: number) => void,
): Promise<PDFDocument> {
  const { loadPdfDocument, pdfRenderToImageData } = await import('./pdf-converters');
  const src = await loadPdfDocument(file);
  try {
    const out = await PDFDocument.create();
    for (const [n, index] of pages.entries()) {
      // PDFium draws the page as displayed (its own /Rotate applied), so the
      // bitmap is the right way up; the size is the displayed page box (the
      // bitmap's is rounded to whole pixels).
      const image = pdfRenderToImageData(await src.getPage(index).render({ scale: level.scale }));
      const { width, height } = sizes[n];
      const jpeg = await encodeImageData(image, 'jpg', level.quality);
      const embedded = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const outPage = out.addPage([width, height]);
      outPage.drawImage(embedded, { x: 0, y: 0, width, height });
      rotate(outPage, rotation);
      onProgress?.(Math.round(10 + ((n + 1) / pages.length) * 80));
    }
    return out;
  } finally {
    src.destroy();
  }
}

/**
 * pdf → pdf: the pages in the chosen range and order, rotated, optionally
 * compressed; one PDF, or a zip of one PDF per page when splitting.
 */
export async function editPdf(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const src = await loadPdf(file);
  const pages = parsePageRange(settings?.pdfPageRange ?? '', src.getPageCount());
  const rotation = settings?.pdfRotate ?? 0;
  const split = settings?.pdfSplit ?? false;
  const level = COMPRESSION[settings?.pdfCompress ?? 'off'];

  const build = async (indices: number[]): Promise<Blob> => {
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(src, indices)) {
      rotate(page, rotation);
      out.addPage(page);
    }
    out.setTitle(src.getTitle() ?? '');
    const plain = await save(out);
    if (!level) return plain;
    const sizes = indices.map((i) => {
      const page = src.getPage(i);
      const { width, height } = page.getSize();
      return page.getRotation().angle % 180 ? { width: height, height: width } : { width, height };
    });
    const small = await save(await rasterise(file, indices, sizes, rotation, level));
    return small.size < plain.size ? small : plain;
  };

  if (!split) {
    const blob = await build(pages);
    onProgress?.(100);
    return blob;
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const base = safeFileStem(file.name.replace(/\.[^.]+$/, ''));
  for (const [n, index] of pages.entries()) {
    zip.file(`${base}-page-${index + 1}.pdf`, await build([index]));
    onProgress?.(Math.round(((n + 1) / pages.length) * 100));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/** Several PDFs and images, in order, as one PDF. */
export async function mergePdf(
  files: File[],
  settings?: Partial<ConversionSettings>,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const out = await PDFDocument.create();
  for (const [n, file] of files.entries()) {
    const ext = getFileExtension(file.name);
    if (!canMerge(ext)) {
      throw new ConversionError('unsupported', `Can't put a .${ext} file into a PDF`);
    }
    // One bad file fails the merge; say which one.
    try {
      if (ext === 'pdf') {
        const src = await loadPdf(file);
        for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
      } else {
        await addImagePage(out, file, settings?.pdfPageSize ?? 'a4');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof ConversionError ? err.code : 'corrupt-input';
      throw new ConversionError(code, `${file.name}: ${message}`);
    }
    onProgress?.(Math.round(((n + 1) / files.length) * 95));
  }
  return save(out);
}
