// Pasting into the page: files and screenshots come in as they are; text
// becomes a file named for what it looks like, so a range copied from a
// spreadsheet arrives as TSV (→ CSV, JSON, XLSX…), a copied web page as
// HTML (→ Markdown, PDF…), and JSON as JSON.

/** Tab-separated rows with the same number of columns, as spreadsheets copy them. */
function looksLikeTsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.length);
  if (lines.length < 2) return false;
  const tabs = (line: string) => line.split('\t').length - 1;
  const columns = tabs(lines[0]);
  return columns > 0 && lines.every((line) => tabs(line) === columns);
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** The extension pasted text is saved under. */
export function pastedTextKind(plain: string, html: string): 'tsv' | 'json' | 'html' | 'txt' {
  if (looksLikeTsv(plain)) return 'tsv';
  if (looksLikeJson(plain)) return 'json';
  if (html.trim()) return 'html';
  return 'txt';
}

/** What a paste adds: its files, else its text as one file; [] for nothing usable. */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  const plain = data.getData('text/plain');
  const html = data.getData('text/html');
  if (!plain.trim() && !html.trim()) return [];
  const kind = pastedTextKind(plain, html);
  const body = kind === 'html' ? html : plain;
  const type = {
    tsv: 'text/tab-separated-values',
    json: 'application/json',
    html: 'text/html',
    txt: 'text/plain',
  }[kind];
  return [new File([body], `pasted.${kind}`, { type })];
}

/**
 * A result as a PNG for the clipboard: browsers only take image/png there.
 * Other image formats are decoded and redrawn; the promise is handed to
 * ClipboardItem as is, which Safari requires within the click.
 */
export async function asClipboardPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error('PNG encode failed'))),
      'image/png',
    ),
  );
}
