// What to do with a file no route takes. Before this, an unknown extension
// became a card with "—" for a target and no word of why. Now the file's
// first bytes decide: if it is really a format we convert (a PNG saved as
// "image.jfif", a PDF with no extension), it is read as that format and the
// card says so; if not, it gets an explanation naming what it is and what to
// export it as instead.

import { getTargetFormats } from './converters';

// Other names for formats we convert.
const ALIASES: Record<string, string> = {
  jfif: 'jpg',
  jpe: 'jpg',
  pjpeg: 'jpg',
  htm: 'html',
  xhtml: 'html',
  markdown: 'md',
  mkd: 'md',
  mdown: 'md',
  yml: 'yaml',
  text: 'txt',
  log: 'txt',
  heif: 'heic',
  qt: 'mov',
  oga: 'ogg',
};

/** Why a file can't be converted; the locale keys are errors.unsupportedFile.<kind>. */
export type UnsupportedKind =
  | 'image' // TIFF, PSD, …: export as PNG/JPG
  | 'raw' // camera RAW: export as JPG
  | 'word' // DOC, RTF, ODT, Pages: save as DOCX
  | 'sheet' // XLS, ODS, Numbers: save as XLSX or CSV
  | 'slides' // PPT(X), Keynote: export as PDF
  | 'archive' // zip, rar, 7z, tar: unpack first
  | 'program' // exe, dmg, …: nothing to convert
  | 'video' // a container we don't read
  | 'audio'
  | 'unknown';

const KNOWN: [UnsupportedKind, string[]][] = [
  ['image', ['tif', 'tiff', 'psd', 'xcf', 'ai', 'eps', 'jp2', 'tga', 'dds', 'exr', 'hdr', 'pcx']],
  ['raw', ['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'raw']],
  ['word', ['doc', 'rtf', 'odt', 'pages', 'wpd']],
  ['sheet', ['xls', 'xlsm', 'xlsb', 'ods', 'numbers']],
  ['slides', ['ppt', 'pptx', 'odp', 'key']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso']],
  ['program', ['exe', 'msi', 'dmg', 'pkg', 'app', 'apk', 'deb', 'rpm', 'bat', 'sh', 'dll']],
  ['video', ['mpg', 'mpeg', 'wmv', 'ts', 'mts', 'm2ts', 'vob', 'ogv', 'rm', 'rmvb', 'asf', 'f4v']],
  ['audio', ['aif', 'aiff', 'amr', 'ape', 'mid', 'midi', 'ac3', 'dts', 'caf', 'wv']],
];
const KIND_BY_EXT = new Map(KNOWN.flatMap(([kind, exts]) => exts.map((e) => [e, kind] as const)));

const ascii = (b: Uint8Array, at: number, text: string) =>
  text.split('').every((c, i) => b[at + i] === c.charCodeAt(0));

/** A format we convert, or an unsupported kind, from the first bytes. */
export function sniff(
  b: Uint8Array,
): { ext: string } | { kind: UnsupportedKind; label: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg' };
  if (ascii(b, 0, '\x89PNG')) return { ext: 'png' };
  if (ascii(b, 0, 'GIF8')) return { ext: 'gif' };
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return { ext: 'webp' };
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return { ext: 'wav' };
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'AVI ')) return { ext: 'avi' };
  // "BM" alone would claim any text starting with it: also check the DIB header size.
  if (ascii(b, 0, 'BM') && [12, 40, 52, 56, 108, 124].includes(b[14]) && !b[15] && !b[16]) {
    return { ext: 'bmp' };
  }
  if (ascii(b, 0, '%PDF-')) return { ext: 'pdf' };
  if (ascii(b, 0, 'fLaC')) return { ext: 'flac' };
  if (ascii(b, 0, 'OggS')) return { ext: 'ogg' };
  if ((ascii(b, 0, 'ID3') && b[3] < 5) || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2)) {
    return { ext: 'mp3' };
  }
  if (ascii(b, 0, 'FLV') && b[3] === 1) return { ext: 'flv' };
  if (b[0] === 0xff && b[1] === 0x0a) return { ext: 'jxl' };
  if (ascii(b, 4, 'JXL ')) return { ext: 'jxl' };
  if (ascii(b, 4, 'ftyp')) {
    const brand = String.fromCharCode(...b.subarray(8, 12));
    if (brand === 'crx ') return { kind: 'raw', label: 'CR3' }; // Canon RAW, ISO-BMFF too
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return { ext: 'heic' };
    if (/^avi[fs]$/.test(brand)) return { ext: 'avif' };
    if (brand === 'qt  ') return { ext: 'mov' };
    if (/^(M4A |M4B )$/.test(brand)) return { ext: 'm4a' };
    if (/^3g/.test(brand)) return { ext: '3gp' };
    return { ext: 'mp4' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // EBML: the DocType says WebM or Matroska.
    const head = String.fromCharCode(...b.subarray(0, 64));
    return { ext: head.includes('webm') ? 'webm' : 'mkv' };
  }
  if (ascii(b, 0, 'II*\0') || ascii(b, 0, 'MM\0*')) return { kind: 'image', label: 'TIFF' };
  if (ascii(b, 0, '8BPS')) return { kind: 'image', label: 'PSD' };
  if (ascii(b, 0, 'PK\x03\x04') || ascii(b, 0, 'Rar!') || ascii(b, 0, '7z\xbc\xaf')) {
    return { kind: 'archive', label: b[0] === 0x50 ? 'ZIP' : b[0] === 0x52 ? 'RAR' : '7Z' };
  }
  if (b[0] === 0x1f && b[1] === 0x8b) return { kind: 'archive', label: 'GZ' };
  const pe = b[0x3c] | (b[0x3d] << 8);
  if (ascii(b, 0, 'MZ') && ascii(b, pe, 'PE\0\0')) return { kind: 'program', label: 'EXE' };
  if (ascii(b, 0, '\x7fELF')) return { kind: 'program', label: 'ELF' };
  if (ascii(b, 0, '{\\rtf')) return { kind: 'word', label: 'RTF' };
  return null;
}

/** Plain UTF-8 text with no control bytes but whitespace: readable as .txt (or better). */
function sniffText(b: Uint8Array): string | null {
  const control = (byte: number) => byte === 0 || (byte < 0x20 && ![9, 10, 12, 13].includes(byte));
  if (b.some(control)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b, { stream: true });
  } catch {
    return null;
  }
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (/^<\?xml/i.test(head)) return /^<\?xml[^>]*>\s*<svg[\s>]/i.test(head) ? 'svg' : 'xml';
  if (/^<svg[\s>]/i.test(head)) return 'svg';
  if (/^(<!doctype html|<html[\s>])/i.test(head)) return 'html';
  if (/^WEBVTT/.test(head)) return 'vtt';
  if (/^\d+\r?\n\d\d:\d\d:\d\d[,.]\d{3} --> /.test(head)) return 'srt';
  return 'txt';
}

export type Identification =
  /** It is a format we convert: rename it to this extension. */
  { ext: string; reason: 'alias' | 'content' } | { kind: UnsupportedKind; label: string };

/** The extension a name ends in, '' for none ("README", ".bashrc"). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * For a file with no route: what it really is. Aliases are trusted; content
 * beats a known-unsupported extension (a JPEG named .tif is a JPEG); text is
 * only guessed for files with no extension or one we don't know, so a .sh
 * script isn't offered as a .txt.
 */
export async function identify(file: File): Promise<Identification> {
  const ext = extensionOf(file.name);
  const alias = ALIASES[ext];
  if (alias) return { ext: alias, reason: 'alias' };
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const sniffed = sniff(head);
  if (sniffed && 'ext' in sniffed) return { ext: sniffed.ext, reason: 'content' };
  const label = ext ? ext.toUpperCase() : '';
  const known = KIND_BY_EXT.get(ext);
  if (known) return { kind: known, label };
  if (sniffed) return { kind: sniffed.kind, label: label || sniffed.label };
  if (head.length) {
    const text = sniffText(head);
    if (text) return { ext: text, reason: 'content' };
  }
  return { kind: 'unknown', label };
}

/** The file under a name the registry routes, keeping its stem. */
export function renamed(file: File, ext: string): File {
  const stem = extensionOf(file.name) ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
  return new File([file], `${stem}.${ext}`, { type: file.type, lastModified: file.lastModified });
}

/** Whether a file needs identifying: nothing is routed from its extension. */
export function needsIdentifying(name: string): boolean {
  return getTargetFormats(extensionOf(name)).length === 0;
}

/** The inputs we do take, per kind, for "try exporting as …" hints. */
export const NEAREST: Record<UnsupportedKind, string> = {
  image: 'PNG, JPG, WebP, HEIC',
  raw: 'JPG, HEIC',
  word: 'DOCX, Markdown, HTML',
  sheet: 'XLSX, CSV',
  slides: 'PDF',
  archive: '',
  program: '',
  video: 'MP4, MOV, MKV, WebM',
  audio: 'MP3, WAV, FLAC, M4A',
  unknown: '',
};
