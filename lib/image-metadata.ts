// Photo metadata: what a file carries, and what an output keeps.
//
// Every image conversion decodes to pixels and encodes afresh, so outputs
// carry no metadata unless it's written back. By default nothing is written
// back (that's the privacy default). "Keep" writes a fresh EXIF block with
// the fields people use: camera, lens, exposure, date, author, and
// optionally location. It is built from parsed values rather than copied
// raw, so Orientation is always 1 (the pixels are already upright) and
// maker notes and thumbnails, which can leak more than they say, never
// come along.

import type { ConversionSettings } from './types';

export interface PhotoMetadata {
  gps?: { latitude: number; longitude: number };
  make?: string;
  model?: string;
  lens?: string;
  /** EXIF DateTimeOriginal as stored: "YYYY:MM:DD HH:MM:SS". */
  taken?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
}

/** Sources exifr can read EXIF from. */
export const METADATA_SOURCES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif']);
/** Targets we can write EXIF into. */
export const METADATA_TARGETS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const text = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.replace(/\0+$/, '').trim() : undefined;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Reads the fields we show and keep; null when the file has none. */
export async function readMetadata(file: Blob): Promise<PhotoMetadata | null> {
  const { default: exifr } = await import('exifr');
  let raw: Record<string, unknown> | undefined;
  try {
    raw = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateValues: false,
      reviveValues: false,
    });
  } catch {
    return null; // no metadata segment, or one exifr can't read: nothing to show
  }
  if (!raw) return null;
  const latitude = num(raw.latitude);
  const longitude = num(raw.longitude);
  const meta: PhotoMetadata = {
    gps: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
    make: text(raw.Make),
    model: text(raw.Model),
    lens: text(raw.LensModel),
    taken: text(raw.DateTimeOriginal) ?? text(raw.CreateDate) ?? text(raw.ModifyDate),
    software: text(raw.Software),
    artist: text(raw.Artist),
    copyright: text(raw.Copyright),
    exposureTime: num(raw.ExposureTime),
    fNumber: num(raw.FNumber),
    iso: num(raw.ISO),
    focalLength: num(raw.FocalLength),
  };
  const present = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
  return Object.keys(present).length ? (present as PhotoMetadata) : null;
}

// --- EXIF (TIFF) writer -----------------------------------------------------------

type Entry =
  | { tag: number; type: 'ascii'; value: string }
  | { tag: number; type: 'short'; value: number }
  | { tag: number; type: 'long'; value: number }
  | { tag: number; type: 'byte'; value: number[] }
  | { tag: number; type: 'rational'; value: [number, number][] };

const TYPE_CODE = { byte: 1, ascii: 2, short: 3, long: 4, rational: 5 } as const;

/** A positive number as a TIFF rational, precise to 1/10000. */
function rational(x: number): [number, number] {
  if (x > 0 && x < 1) return [1, Math.round(1 / x)]; // exposure times read as 1/250
  return [Math.round(x * 10000), 10000];
}

function dms(deg: number): [number, number][] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = (a - d - m / 60) * 3600;
  return [
    [d, 1],
    [m, 1],
    [Math.round(s * 10000), 10000],
  ];
}

function dataSize(e: Entry): number {
  switch (e.type) {
    case 'ascii':
      return new TextEncoder().encode(e.value).length + 1;
    case 'short':
      return 2;
    case 'long':
      return 4;
    case 'byte':
      return e.value.length;
    case 'rational':
      return 8 * e.value.length;
  }
}

/**
 * A big-endian TIFF block (what JPEG APP1 carries after "Exif\0\0") holding
 * IFD0, the Exif IFD and, if kept, the GPS IFD. Orientation is always 1.
 */
export function buildExif(meta: PhotoMetadata, { keepGps }: { keepGps: boolean }): Uint8Array {
  const ifd0: Entry[] = [];
  const exif: Entry[] = [];
  const gps: Entry[] = [];
  const ascii = (list: Entry[], tag: number, value?: string) =>
    value && list.push({ tag, type: 'ascii', value });

  ascii(ifd0, 0x010f, meta.make);
  ascii(ifd0, 0x0110, meta.model);
  ifd0.push({ tag: 0x0112, type: 'short', value: 1 });
  ascii(ifd0, 0x0131, meta.software);
  ascii(ifd0, 0x013b, meta.artist);
  ascii(ifd0, 0x8298, meta.copyright);

  if (meta.exposureTime)
    exif.push({ tag: 0x829a, type: 'rational', value: [rational(meta.exposureTime)] });
  if (meta.fNumber) exif.push({ tag: 0x829d, type: 'rational', value: [rational(meta.fNumber)] });
  if (meta.iso)
    exif.push({ tag: 0x8827, type: 'short', value: Math.min(65535, Math.round(meta.iso)) });
  ascii(exif, 0x9003, meta.taken);
  if (meta.focalLength)
    exif.push({ tag: 0x920a, type: 'rational', value: [rational(meta.focalLength)] });
  ascii(exif, 0xa434, meta.lens);

  if (keepGps && meta.gps) {
    const { latitude, longitude } = meta.gps;
    gps.push(
      { tag: 0x0000, type: 'byte', value: [2, 2, 0, 0] },
      { tag: 0x0001, type: 'ascii', value: latitude >= 0 ? 'N' : 'S' },
      { tag: 0x0002, type: 'rational', value: dms(latitude) },
      { tag: 0x0003, type: 'ascii', value: longitude >= 0 ? 'E' : 'W' },
      { tag: 0x0004, type: 'rational', value: dms(longitude) },
    );
  }

  // Pointers to the sub-IFDs; their values are filled in once offsets are known.
  const exifPtr: Entry | null = exif.length ? { tag: 0x8769, type: 'long', value: 0 } : null;
  const gpsPtr: Entry | null = gps.length ? { tag: 0x8825, type: 'long', value: 0 } : null;
  if (exifPtr) ifd0.push(exifPtr);
  if (gpsPtr) ifd0.push(gpsPtr);

  const ifds = [ifd0, exif, gps].filter((ifd) => ifd.length);
  for (const ifd of ifds) ifd.sort((a, b) => a.tag - b.tag);

  // Layout: header (8), then each IFD followed by its out-of-line data.
  const ifdSize = (ifd: Entry[]) => 2 + ifd.length * 12 + 4;
  const extSize = (ifd: Entry[]) =>
    ifd.reduce((n, e) => n + (dataSize(e) > 4 ? dataSize(e) + (dataSize(e) % 2) : 0), 0);
  const offsets: number[] = [];
  let at = 8;
  for (const ifd of ifds) {
    offsets.push(at);
    at += ifdSize(ifd) + extSize(ifd);
  }
  if (exifPtr) exifPtr.value = offsets[ifds.indexOf(exif)];
  if (gpsPtr) gpsPtr.value = offsets[ifds.indexOf(gps)];

  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  out.set([0x4d, 0x4d, 0x00, 0x2a]); // "MM", 42: big-endian TIFF
  view.setUint32(4, 8);

  ifds.forEach((ifd, i) => {
    let pos = offsets[i];
    let ext = pos + ifdSize(ifd);
    view.setUint16(pos, ifd.length);
    pos += 2;
    for (const e of ifd) {
      const size = dataSize(e);
      const count =
        e.type === 'ascii' ? size : e.type === 'byte' || e.type === 'rational' ? e.value.length : 1;
      view.setUint16(pos, e.tag);
      view.setUint16(pos + 2, TYPE_CODE[e.type]);
      view.setUint32(pos + 4, count);
      const target = size > 4 ? ext : pos + 8;
      if (size > 4) view.setUint32(pos + 8, ext);
      switch (e.type) {
        case 'ascii':
          out.set(new TextEncoder().encode(e.value), target); // NUL already zeroed
          break;
        case 'short':
          view.setUint16(target, e.value);
          break;
        case 'long':
          view.setUint32(target, e.value);
          break;
        case 'byte':
          out.set(e.value, target);
          break;
        case 'rational':
          e.value.forEach(([n, d], k) => {
            view.setUint32(target + 8 * k, n);
            view.setUint32(target + 8 * k + 4, d);
          });
          break;
      }
      if (size > 4) ext += size + (size % 2);
      pos += 12;
    }
    view.setUint32(pos, 0); // no next IFD
  });
  return out;
}

// --- Writing into containers --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** JPEG: an APP1 "Exif" segment right after SOI (and after JFIF's APP0, if present). */
function jpegWithExif(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const payload = concat(new TextEncoder().encode('Exif\0\0'), tiff);
  const header = new Uint8Array([
    0xff,
    0xe1,
    (payload.length + 2) >> 8,
    (payload.length + 2) & 0xff,
  ]);
  return concat(jpeg.subarray(0, at), header, payload, jpeg.subarray(at));
}

/** PNG: an eXIf chunk right after IHDR (it must precede IDAT). */
function pngWithExif(png: Uint8Array, tiff: Uint8Array): Uint8Array {
  const ihdrEnd = 8 + 8 + ((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]) + 4;
  const chunk = new Uint8Array(12 + tiff.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, tiff.length);
  chunk.set(new TextEncoder().encode('eXIf'), 4);
  chunk.set(tiff, 8);
  view.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
  return concat(png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd));
}

/**
 * WebP: EXIF lives in an extended (VP8X) file. A simple VP8/VP8L file gets a
 * VP8X header in front (canvas size and alpha flag read from the bitstream);
 * then the EXIF flag is set and an EXIF chunk appended.
 */
function webpWithExif(webp: Uint8Array, tiff: Uint8Array): Uint8Array {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const fourcc = (at: number) => String.fromCharCode(...webp.subarray(at, at + 4));
  let body = webp.subarray(12);
  if (fourcc(12) !== 'VP8X') {
    let width: number;
    let height: number;
    let alpha = false;
    if (fourcc(12) === 'VP8L') {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      alpha = ((bits >> 28) & 1) === 1;
    } else {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
    const vp8x = new Uint8Array(18);
    vp8x.set(new TextEncoder().encode('VP8X'));
    new DataView(vp8x.buffer).setUint32(4, 10, true);
    vp8x[8] = alpha ? 0x10 : 0;
    const w = width - 1;
    const h = height - 1;
    vp8x.set(
      [w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff],
      12,
    );
    body = concat(vp8x, body);
  }
  body = body.slice();
  body[8] |= 0x08; // EXIF present
  const chunk = new Uint8Array(8 + tiff.length + (tiff.length % 2));
  chunk.set(new TextEncoder().encode('EXIF'));
  new DataView(chunk.buffer).setUint32(4, tiff.length, true);
  chunk.set(tiff, 8);
  const riff = new Uint8Array(12);
  riff.set(new TextEncoder().encode('RIFF'));
  new DataView(riff.buffer).setUint32(4, 4 + body.length + chunk.length, true);
  riff.set(new TextEncoder().encode('WEBP'), 8);
  return concat(riff, body, chunk);
}

/** The output with the source's metadata written back, as the setting asks. */
export async function applyMetadata(
  source: Blob,
  output: Blob,
  targetExt: string,
  settings?: Partial<ConversionSettings>,
): Promise<Blob> {
  const mode = settings?.metadata ?? 'strip';
  const ext = targetExt.toLowerCase();
  if (mode === 'strip' || !METADATA_TARGETS.has(ext)) return output;
  const meta = await readMetadata(source);
  if (!meta) return output;
  const tiff = buildExif(meta, { keepGps: mode === 'keep' });
  const bytes = insertExif(new Uint8Array(await output.arrayBuffer()), ext, tiff);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: output.type });
}

/** Encoded JPEG/PNG/WebP bytes with a TIFF (EXIF) block added. */
export function insertExif(bytes: Uint8Array, ext: string, tiff: Uint8Array): Uint8Array {
  if (ext === 'png') return pngWithExif(bytes, tiff);
  if (ext === 'webp') return webpWithExif(bytes, tiff);
  return jpegWithExif(bytes, tiff);
}

/**
 * JPEG bytes without metadata segments: EXIF/XMP (APP1), IPTC (APP13) and
 * comments go; JFIF (APP0), the ICC colour profile (APP2) and Adobe's colour
 * transform (APP14) stay, since the image renders wrong without them. For
 * embedding a JPEG as-is (image → PDF) without carrying its location along.
 */
export function stripJpegMetadata(jpeg: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    const length = (jpeg[at + 2] << 8) | jpeg[at + 3];
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) parts.push(jpeg.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  parts.push(jpeg.subarray(at));
  return concat(...parts);
}
