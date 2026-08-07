import type { ConversionSettings } from './types';
import { ASSET_BASE, encodeImageData } from './image-encode';

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  const quality = settings?.quality ?? 0.92;
  const scale = settings?.pdfScale ?? 1;
  const allPages = settings?.pdfAllPages ?? false;
  const doc = await loadPdfDocument(file);
  try {
    const pageCount = doc.getPageCount();
    if (pageCount < 1) throw new Error('PDF has no pages');

    if (!allPages) {
      const rendered = await doc.getPage(0).render({ scale });
      const imageData = bgraToRgba(rendered);
      onProgress?.(100);
      return encodeImageData(imageData, targetExt, quality);
    }

    const base = file.name.replace(/\.[^.]+$/, '');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (let i = 0; i < pageCount; i++) {
      const rendered = await doc.getPage(i).render({ scale });
      const imageData = bgraToRgba(rendered);
      const imageBlob = await encodeImageData(imageData, targetExt, quality);
      zip.file(`${base}-page-${i + 1}.${targetExt}`, imageBlob);
      onProgress?.(Math.round(((i + 1) / pageCount) * 100));
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  } finally {
    doc.destroy();
  }
}

// Extract text from every page into a single plain-text Blob.
export async function pdfToText(
  file: File,
  _sourceExt: string,
  _targetExt: string,
  _settings?: ConversionSettings,
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts: string[] = [];
    for (const page of doc.pages()) {
      parts.push(page.getText());
    }
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
  _onProgress?: (pct: number) => void,
): Promise<Blob> {
  const doc = await loadPdfDocument(file);
  try {
    const parts: string[] = [];
    for (const page of doc.pages()) {
      parts.push(`<pre>${escapeHtml(page.getText())}</pre>`);
    }
    const html =
      '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Converted PDF</title></head>\n' +
      `<body>\n${parts.join('\n')}\n</body></html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  } finally {
    doc.destroy();
  }
}

async function htmlToPdfBlob(htmlContent: string): Promise<Blob> {
  const jsPDF = await getJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Use a simple approach: split HTML into pages
  // jsPDF doesn't have a direct HTML renderer, so we convert HTML to plain-ish text
  // with basic formatting
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const plainText = tempDiv.textContent ?? htmlContent;

  const lines = doc.splitTextToSize(plainText, 520);
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const lineHeight = 12;
  let y = margin;

  for (const line of lines as string[]) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
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
  const text = await file.text();
  const html = text
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('');
  return htmlToPdfBlob(html);
}

export async function mdToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const { marked } = await import('marked');
  const text = await file.text();
  const htmlBody = await marked.parse(text);
  const html = `<div>${htmlBody}</div>`;
  return htmlToPdfBlob(html);
}

export async function htmlToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const htmlContent = await file.text();
  return htmlToPdfBlob(htmlContent);
}

export async function jsonToPdf(
  file: File,
  _s: string,
  _t: string,
  _settings?: ConversionSettings,
): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const formatted = JSON.stringify(data, null, 2);
  const lines = formatted.split('\n');
  const html = `<pre style="font-family: monospace; font-size: 10pt;">${lines.map((l) => `<span>${l}</span>`).join('<br/>')}</pre>`;
  return htmlToPdfBlob(html);
}
