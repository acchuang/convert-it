// TIFF input (scans, print and photo-editing exports) through UTIF (utif2,
// MIT, photopea): baseline strips and tiles, uncompressed, LZW, Deflate,
// PackBits, CCITT G3/G4 and JPEG, at 1–16 bits per channel, RGB, grey,
// palette and CMYK. It's loaded on first use and only in the worker.
//
// A multi-page TIFF converts its first page; thumbnails (reduced-resolution
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

/** The first page's pixels. */
export async function decodeTiff(file: Blob): Promise<ImageData> {
  const UTIF = (await import('utif2')).default as unknown as {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
  };
  const buffer = await file.arrayBuffer();
  const corrupt = (why: string) =>
    new ConversionError('corrupt-input', `Not a readable TIFF: ${why}`);
  let ifds: Ifd[];
  try {
    ifds = UTIF.decode(buffer);
  } catch (err) {
    throw corrupt(err instanceof Error ? err.message : String(err));
  }
  // Bit 0 of NewSubfileType marks a reduced-resolution copy (a thumbnail).
  const isPage = (ifd: Ifd) =>
    ifd[WIDTH] !== undefined && !((((ifd[SUBFILE_TYPE] as number[]) ?? [0])[0] ?? 0) & 1);
  const page = ifds.find(isPage) ?? ifds.find((ifd) => ifd[WIDTH] !== undefined);
  if (!page) throw corrupt('no image in the file');
  try {
    UTIF.decodeImage(buffer, page);
  } catch (err) {
    throw corrupt(err instanceof Error ? err.message : String(err));
  }
  const { width, height } = page;
  if (!width || !height || !page.data?.length) throw corrupt('no pixel data');
  const cmyk = ((page[PHOTOMETRIC] as number[]) ?? [])[0] === CMYK;
  const rgba = cmyk ? cmykToRgba(page) : UTIF.toRGBA8(page);
  if (rgba.length < width * height * 4) throw corrupt('no pixel data');
  return new ImageData(
    new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, width * height * 4),
    width,
    height,
  );
}
