// TIFF input (scans, print and photo-editing exports) through UTIF (utif2,
// MIT, photopea): baseline strips and tiles, uncompressed, LZW, Deflate,
// PackBits, CCITT G3/G4 and JPEG, at 1–16 bits per channel, RGB, grey,
// palette and CMYK. It's loaded on first use and only in the worker.
//
// Every page is read, one at a time; thumbnails (reduced-resolution
// subfiles) are skipped.

import { ConversionError } from './errors';

interface Ifd {
  [tag: string]: unknown;
  width: number;
  height: number;
  data: Uint8Array;
}

const SUBFILE_TYPE = 't254';
const WIDTH = 't256';
const PHOTOMETRIC = 't262';
const SAMPLES = 't277';
const CMYK = 5;
// Strip and tile offsets / byte counts.
const CHUNKS: [string, string][] = [
  ['t273', 't279'],
  ['t324', 't325'],
];

/**
 * 8-bit CMYK(A) to RGBA, as UTIF does it. Its own toRGBA8 reads
 * `window.UDOC` in this branch, which throws in a worker.
 */
function cmykToRgba(ifd: Ifd): Uint8Array {
  const { width, height, data } = ifd;
  const samples = ((ifd[SAMPLES] as number[]) ?? [4])[0];
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * samples;
    const k = (255 - data[s + 3]) / 255;
    out[i * 4] = Math.round((255 - data[s]) * k);
    out[i * 4 + 1] = Math.round((255 - data[s + 1]) * k);
    out[i * 4 + 2] = Math.round((255 - data[s + 2]) * k);
    out[i * 4 + 3] = samples > 4 ? data[s + 4] : 255;
  }
  return out;
}

interface Utif {
  decode(buffer: ArrayBuffer): Ifd[];
  decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
  toRGBA8(ifd: Ifd): Uint8Array;
}

const corrupt = (why: string) =>
  new ConversionError('corrupt-input', `Not a readable TIFF: ${why}`);
const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

function toImageData(UTIF: Utif, buffer: ArrayBuffer, page: Ifd): ImageData {
  // UTIF zero-fills data that lies past the end, so a truncated file would
  // come out as a black page instead of an error.
  for (const [offsets, counts] of CHUNKS) {
    const at = (page[offsets] as number[]) ?? [];
    const len = (page[counts] as number[]) ?? [];
    if (at.some((o, i) => o + (len[i] ?? 0) > buffer.byteLength))
      throw new Error('the file is cut short');
  }
  UTIF.decodeImage(buffer, page);
  const { width, height } = page;
  if (!width || !height || !page.data?.length) throw new Error('no pixel data');
  const cmyk = ((page[PHOTOMETRIC] as number[]) ?? [])[0] === CMYK;
  const rgba = cmyk ? cmykToRgba(page) : UTIF.toRGBA8(page);
  // Drop the decoded strip so only one page's pixels are alive at a time.
  delete (page as Partial<Ifd>).data;
  if (rgba.length < width * height * 4) throw new Error('no pixel data');
  return new ImageData(
    new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, width * height * 4),
    width,
    height,
  );
}

/**
 * The page count up front (parsing the directories is cheap) and the pages'
 * pixels, decoded one at a time as they're taken. A page that won't decode
 * fails the whole file, naming the page.
 */
export async function tiffPages(
  file: Blob,
): Promise<{ count: number; pages: Generator<ImageData, void, undefined> }> {
  const UTIF = (await import('utif2')).default as unknown as Utif;
  const buffer = await file.arrayBuffer();
  let ifds: Ifd[];
  try {
    ifds = UTIF.decode(buffer);
  } catch (err) {
    throw corrupt(reason(err));
  }
  const images = ifds.filter((ifd) => ifd[WIDTH] !== undefined);
  // Bit 0 of NewSubfileType marks a reduced-resolution copy (a thumbnail).
  const full = images.filter((ifd) => !((((ifd[SUBFILE_TYPE] as number[]) ?? [0])[0] ?? 0) & 1));
  const pages = full.length ? full : images.slice(0, 1);
  if (!pages.length) throw corrupt('no image in the file');
  const count = pages.length;
  function* each() {
    for (const [i, page] of pages.entries()) {
      try {
        yield toImageData(UTIF, buffer, page);
      } catch (err) {
        throw corrupt(count > 1 ? `page ${i + 1} of ${count}: ${reason(err)}` : reason(err));
      }
    }
  }
  return { count, pages: each() };
}

/** The first page's pixels. */
export async function decodeTiff(file: Blob): Promise<ImageData> {
  const { pages } = await tiffPages(file);
  return pages.next().value as ImageData;
}
