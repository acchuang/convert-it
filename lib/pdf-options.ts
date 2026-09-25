// The light half of the PDF tools: page ranges and what can be merged. No
// pdf-lib import, so the UI can use these without pulling pdf-lib in.
import { ConversionError } from './errors';

/**
 * "1-3, 5, 8-" → zero-based page indices, in the order written. "-3" is the
 * first three, "8-" page 8 to the end, "5-2" runs backwards (so a range also
 * reorders), and a page may appear twice. Blank means every page.
 */
export function parsePageRange(spec: string, pageCount: number): number[] {
  const text = spec.trim();
  if (!text) return Array.from({ length: pageCount }, (_, i) => i);
  const pages: number[] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let from: number;
    let to: number;
    if (m && (m[1] || m[2])) {
      from = m[1] ? Number(m[1]) : 1;
      to = m[2] ? Number(m[2]) : pageCount;
    } else if (/^\d+$/.test(part)) {
      from = to = Number(part);
    } else {
      throw new ConversionError(
        'invalid-settings',
        `“${part}” is not a page or a range (e.g. 1-3, 5)`,
      );
    }
    for (const n of [from, to]) {
      if (n < 1 || n > pageCount) {
        throw new ConversionError(
          'invalid-settings',
          `Page ${n} is out of range: this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}`,
        );
      }
    }
    const step = from <= to ? 1 : -1;
    for (let n = from; n !== to + step; n += step) pages.push(n - 1);
  }
  return pages;
}

/** Whether a page range is well-formed, before the page count is known (for the UI). */
export function isPageRangeSyntax(spec: string): boolean {
  return (
    spec.trim() === '' ||
    spec.split(',').every((p) => /^\s*(\d+|\d*\s*-\s*\d*)\s*$/.test(p) && /\d/.test(p))
  );
}

const MERGE_IMAGES = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'svg',
  'heic',
  'avif',
  'jxl',
]);

/** Whether mergePdf takes this source: PDFs (every page) or images (a page each). */
export function canMerge(ext: string): boolean {
  return ext === 'pdf' || MERGE_IMAGES.has(ext);
}
