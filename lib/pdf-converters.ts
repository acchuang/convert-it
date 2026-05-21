import type { ConversionSettings } from './types';

// Lazy-load jsPDF to avoid bloating initial bundle
async function getJsPDF() {
  const { jsPDF } = await import('jspdf');
  return jsPDF;
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

export async function txtToPdf(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const text = await file.text();
  const html = text
    .split('\n')
    .map(line => `<p>${line}</p>`)
    .join('');
  return htmlToPdfBlob(html);
}

export async function mdToPdf(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const { marked } = await import('marked');
  const text = await file.text();
  const htmlBody = await marked.parse(text);
  const html = `<div>${htmlBody}</div>`;
  return htmlToPdfBlob(html);
}

export async function htmlToPdf(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const htmlContent = await file.text();
  return htmlToPdfBlob(htmlContent);
}

export async function jsonToPdf(file: File, _s: string, _t: string, _settings?: ConversionSettings): Promise<Blob> {
  const text = await file.text();
  const data = JSON.parse(text);
  const formatted = JSON.stringify(data, null, 2);
  const lines = formatted.split('\n');
  const html = `<pre style="font-family: monospace; font-size: 10pt;">${lines.map(l => `<span>${l}</span>`).join('<br/>')}</pre>`;
  return htmlToPdfBlob(html);
}
