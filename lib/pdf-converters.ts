import type { ConversionSettings } from './types';
import { ASSET_BASE, finishImage } from './image-encode';
import { htmlToPlainText } from './html-text';
import { escapeHtml } from './markup';

// Lazy-load jsPDF to avoid bloating initial bundle
async function getJsPDF() {
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

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

// PDFium renders to a BGRA byte buffer; ImageData expects RGBA, so swap R/B.
function bgraToRgba(render: { width: number; height: number; data: Uint8Array }): ImageData {
  const { width, height, data } = render;
  const rgba = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    rgba[i] = data[i + 2];
    rgba[i + 1] = data[i + 1];
    rgba[i + 2] = data[i];
    rgba[i + 3] = data[i + 3];
  }
  return new ImageData(rgba, width, height);
}

async function loadPdfDocument(file: File) {
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
      const imageData = bgraToRgba(await doc.getPage(0).render({ scale }));
      const blob = await finishImage(imageData, targetExt, settings, onProgress);
      onProgress?.(100);
      return blob;
    }

    const base = file.name.replace(/\.[^.]+$/, '');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (let i = 0; i < pageCount; i++) {
      const imageData = bgraToRgba(await doc.getPage(i).render({ scale }));
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
function pageTexts(doc: PdfDocument, onProgress?: (pct: number) => void): string[] {
  const count = doc.getPageCount();
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(doc.getPage(i).getText());
    onProgress?.(Math.round(((i + 1) / count) * 100));
  }
  return parts;
}

// Extract text from every page into a single plain-text Blob.
export async function pdfToText(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  _settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts = pageTexts(doc, onProgress);
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
  _settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts = pageTexts(doc, onProgress).map((text) => `<pre>${escapeHtml(text)}</pre>`);
    const html =
      '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Converted PDF</title></head>\n' +
      `<body>\n${parts.join('\n')}\n</body></html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  } finally {
    doc.destroy();
  }
}

interface PdfTextOptions {
  monospace?: boolean;
}

// Lays plain text out on A4 pages, one source line at a time, so the input's
// line breaks and blank lines survive. splitTextToSize only wraps what is too
// wide; it never has to guess where a line ended.
async function textToPdfBlob(text: string, options: PdfTextOptions = {}): Promise<Blob> {
  const jsPDF = await getJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fontSize = options.monospace ? 9 : 11;
  doc.setFont(options.monospace ? 'courier' : 'helvetica', 'normal');
  doc.setFontSize(fontSize);

  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = fontSize * 1.35;
  let y = margin + fontSize;

  // jsPDF draws a tab as a glyph box; expand to spaces so indentation holds.
  const sourceLines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  for (const sourceLine of sourceLines) {
    const wrapped: string[] =
      sourceLine === '' ? [''] : doc.splitTextToSize(sourceLine, pageWidth - margin * 2);
    for (const line of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin + fontSize;
      }
      if (line) doc.text(line, margin, y);
      y += lineHeight;
    }
  }

  return doc.output('blob');
}

// --- PDF output (generation via jsPDF) below ---

export async function txtToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  return textToPdfBlob(await file.text());
}

export async function mdToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const { marked } = await import('marked');
  const text = await file.text();
  const html = await marked.parse(text);
  return textToPdfBlob(htmlToPlainText(html));
}

export async function htmlToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  return textToPdfBlob(htmlToPlainText(await file.text()));
}

export async function jsonToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  return textToPdfBlob(JSON.stringify(data, null, 2), { monospace: true });
}
