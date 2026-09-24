import type { ConversionSettings } from './types';
import { ASSET_BASE, encodeImageData, finishImage } from './image-encode';
import { htmlToPlainText } from './html-text';
import { escapeHtml } from './markup';
import { renderPdf, textBlocks } from './pdf-layout';

// PDFium (BSD-3) wrapped by @hyzyla/pdfium (MIT). The ~265 KB glue and ~4 MB wasm
// are lazy: the module is dynamically imported only when a PDF is converted, and
// the library (one wasm instance) initialises once via the asset-base wasm URL.
type PDFiumLibrary = import('@hyzyla/pdfium').PDFiumLibrary;
let pdfiumReady: Promise<PDFiumLibrary> | null = null;
function ensurePdfium(): Promise<PDFiumLibrary> {
  if (!pdfiumReady) {
    pdfiumReady = import('@hyzyla/pdfium').then(({ PDFiumLibrary }) =>
      PDFiumLibrary.init({ wasmUrl: `${ASSET_BASE}/pdfium.wasm` }),
    );
  }
  return pdfiumReady;
}

// @hyzyla/pdfium's default renderer already converts PDFium's BGRA bitmap to
// RGBA, whatever its "BGRA" colorSpace option suggests: a pure-blue page comes
// back as [0, 0, 255, 255]. The old code swapped R and B a second time, so every
// PDF → image had red and blue exchanged. Pinned against real PDFium in
// lib/__tests__/pdf-converters.test.ts and the smoke suite's blue-page pair.
export function pdfRenderToImageData(render: {
  width: number;
  height: number;
  data: Uint8Array;
}): ImageData {
  const { width, height, data } = render;
  return new ImageData(new Uint8ClampedArray(data), width, height);
}

export async function loadPdfDocument(file: Blob) {
  const library = await ensurePdfium();
  const data = new Uint8Array(await file.arrayBuffer());
  return library.loadDocument(data);
}

// Render PDF to png/jpg/webp via pdfium → ImageData → the shared jSquash encode
// pipeline. By default renders page 1 as a single image; when settings.pdfAllPages
// is set, renders every page at settings.pdfScale and zips them (application/zip).
export async function pdfToImage(
  file: File,
  _sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const scale = settings?.pdfScale ?? 1;
  const allPages = settings?.pdfAllPages ?? false;
  const doc = await loadPdfDocument(file);
  try {
    const pageCount = doc.getPageCount();
    if (pageCount < 1) throw new Error('PDF has no pages');

    // Pages go through finishImage like any decoded image, so the toolbox
    // (crop, resize, compress-to-size) applies to PDF pages too.
    if (!allPages) {
      const imageData = pdfRenderToImageData(await doc.getPage(0).render({ scale }));
      const blob = await finishImage(imageData, targetExt, settings, onProgress);
      onProgress?.(100);
      return blob;
    }

    const base = file.name.replace(/\.[^.]+$/, '');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (let i = 0; i < pageCount; i++) {
      const imageData = pdfRenderToImageData(await doc.getPage(i).render({ scale }));
      // No per-page progress from the target-size search: it would make the
      // bar jump back on every page. Pages done is the honest measure.
      const imageBlob = await finishImage(imageData, targetExt, settings);
      zip.file(`${base}-page-${i + 1}.${targetExt}`, imageBlob);
      onProgress?.(Math.round(((i + 1) / pageCount) * 100));
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  } finally {
    doc.destroy();
  }
}

type PdfDocument = Awaited<ReturnType<typeof loadPdfDocument>>;

// Text of every page, reporting progress per page: a 500-page PDF otherwise
// sits at 10% until it's suddenly done.
// A page with no text layer is a scan (or a photo of a page): it is
// rendered and read by OCR instead of coming out blank. OCR is loaded only
// when a page needs it.
async function pageTexts(
  doc: PdfDocument,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<string[]> {
  const count = doc.getPageCount();
  const parts: string[] = [];
  const report = (i: number, within = 1) => onProgress?.(Math.round(((i + within) / count) * 100));
  for (let i = 0; i < count; i++) {
    const page = doc.getPage(i);
    let text = page.getText();
    if (!text.trim()) {
      const [{ recognize }, { tidy }] = await Promise.all([
        import('./ocr'),
        import('./ocr-converters'),
      ]);
      const image = pdfRenderToImageData(await page.render({ scale: 2 }));
      const bmp = await encodeImageData(image, 'bmp', 1);
      text = tidy(await recognize(bmp, settings?.ocrLanguage ?? 'eng', (f) => report(i, f))).trim();
    }
    parts.push(text);
    report(i);
  }
  return parts;
}

// Extract text from every page into a single plain-text Blob.
export async function pdfToText(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts = await pageTexts(doc, settings, onProgress);
    return new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  } finally {
    doc.destroy();
  }
}

// Wrap each page's text in a minimal HTML document.
export async function pdfToHtml(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts = (await pageTexts(doc, settings, onProgress)).map(
      (text) => `<pre>${escapeHtml(text)}</pre>`,
    );
    const html =
      '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Converted PDF</title></head>\n' +
      `<body>\n${parts.join('\n')}\n</body></html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  } finally {
    doc.destroy();
  }
}

// --- PDF output (generation via jsPDF) below ---

export async function txtToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  return renderPdf(textBlocks(await file.text()));
}

export async function mdToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const { markdownBlocks } = await import('./markdown-blocks');
  return renderPdf(markdownBlocks(await file.text()));
}

export async function htmlToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  return renderPdf(textBlocks(htmlToPlainText(await file.text())));
}

export async function jsonToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  return renderPdf(textBlocks(JSON.stringify(data, null, 2), true));
}
