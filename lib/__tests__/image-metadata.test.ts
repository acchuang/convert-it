import { describe, expect, it } from 'vitest';
import exifr from 'exifr';
import { createCanvas } from 'canvas';
import {
  applyMetadata,
  buildExif,
  insertExif,
  readMetadata,
  stripJpegMetadata,
  type PhotoMetadata,
} from '@/lib/image-metadata';

// What a phone photo carries. Written with our own writer, then every
// assertion reads it back with exifr: an independent parser.
const PHONE: PhotoMetadata = {
  gps: { latitude: 48.858372, longitude: -2.294481 },
  make: 'Apple',
  model: 'iPhone 15 Pro',
  lens: 'iPhone 15 Pro back camera 6.86mm f/1.78',
  taken: '2024:05:01 14:03:22',
  software: '17.4.1',
  exposureTime: 1 / 250,
  fNumber: 1.78,
  iso: 64,
  focalLength: 6.86,
};

function encoded(type: 'image/jpeg' | 'image/png'): Uint8Array {
  const canvas = createCanvas(16, 12);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, 16, 12);
  return new Uint8Array(canvas.toBuffer(type as 'image/png'));
}

const blob = (bytes: Uint8Array, type = 'image/jpeg') =>
  new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

async function phonePhoto(): Promise<File> {
  const bytes = insertExif(encoded('image/jpeg'), 'jpg', buildExif(PHONE, { keepGps: true }));
  return new File([bytes as Uint8Array<ArrayBuffer>], 'IMG_0001.jpg', { type: 'image/jpeg' });
}

describe('buildExif, read back by exifr', () => {
  it('writes camera, lens, exposure, date and location', async () => {
    const tags = await exifr.parse(
      blob(
        await phonePhoto()
          .then((f) => f.arrayBuffer())
          .then((b) => new Uint8Array(b)),
      ),
    );
    expect(tags).toMatchObject({
      Make: 'Apple',
      Model: 'iPhone 15 Pro',
      LensModel: PHONE.lens,
      Software: '17.4.1',
      ExposureTime: 1 / 250,
      FNumber: 1.78,
      ISO: 64,
      FocalLength: 6.86,
      Orientation: 'Horizontal (normal)', // 1, as exifr names it
    });
    expect(tags.latitude).toBeCloseTo(48.858372, 5);
    expect(tags.longitude).toBeCloseTo(-2.294481, 5);
    expect(new Date(tags.DateTimeOriginal).getFullYear()).toBe(2024);
  });

  it('keepGps: false leaves no GPS IFD at all', async () => {
    const bytes = insertExif(encoded('image/jpeg'), 'jpg', buildExif(PHONE, { keepGps: false }));
    const tags = await exifr.parse(blob(bytes), { gps: true });
    expect(tags.Model).toBe('iPhone 15 Pro');
    expect(tags.latitude).toBeUndefined();
    expect(tags.GPSLatitude).toBeUndefined();
  });
});

describe('readMetadata', () => {
  it('summarises what a photo carries', async () => {
    const meta = await readMetadata(await phonePhoto());
    expect(meta?.gps?.latitude).toBeCloseTo(48.858372, 5);
    expect(meta).toMatchObject({ make: 'Apple', model: 'iPhone 15 Pro', iso: 64 });
    expect(meta?.taken).toMatch(/^2024/);
  });

  it('null when there is nothing, including for files exifr cannot read', async () => {
    expect(await readMetadata(blob(encoded('image/jpeg')))).toBeNull();
    expect(await readMetadata(new Blob(['not an image']))).toBeNull();
  });
});

describe('applyMetadata', () => {
  const output = blob(encoded('image/jpeg'));

  it('strip (the default) returns the output untouched', async () => {
    const photo = await phonePhoto();
    expect(await applyMetadata(photo, output, 'jpg', {})).toBe(output);
    expect(await applyMetadata(photo, output, 'jpg', { metadata: 'strip' })).toBe(output);
  });

  it('keep writes it all back; keep-no-gps drops only the location', async () => {
    const photo = await phonePhoto();
    const kept = await exifr.parse(await applyMetadata(photo, output, 'jpg', { metadata: 'keep' }));
    expect(kept.latitude).toBeCloseTo(48.858372, 5);
    expect(kept.Model).toBe('iPhone 15 Pro');
    const noGps = await exifr.parse(
      await applyMetadata(photo, output, 'jpg', { metadata: 'keep-no-gps' }),
    );
    expect(noGps.Model).toBe('iPhone 15 Pro');
    expect(noGps.latitude).toBeUndefined();
  });

  it('PNG output gets an eXIf chunk before IDAT with a valid CRC', async () => {
    const png = blob(encoded('image/png'), 'image/png');
    const out = new Uint8Array(
      await (
        await applyMetadata(await phonePhoto(), png, 'png', { metadata: 'keep' })
      ).arrayBuffer(),
    );
    const tags = await exifr.parse(blob(out, 'image/png'));
    expect(tags.Model).toBe('iPhone 15 Pro');
    const text = new TextDecoder('latin1').decode(out);
    expect(text.indexOf('eXIf')).toBeLessThan(text.indexOf('IDAT'));
    // node-canvas decodes it again: the chunk (and its CRC) didn't break the file.
    const { loadImage } = await import('canvas');
    const img = await loadImage(Buffer.from(out));
    expect([img.width, img.height]).toEqual([16, 12]);
  });

  it('never writes into formats without an EXIF writer', async () => {
    const avif = new Blob(['avif-bytes'], { type: 'image/avif' });
    expect(await applyMetadata(await phonePhoto(), avif, 'avif', { metadata: 'keep' })).toBe(avif);
  });
});

describe('WebP', () => {
  // A minimal lossless (VP8L) WebP: RIFF header plus a VP8L chunk whose header
  // says 16×12 with alpha. The pixel data isn't needed to check the container.
  function vp8l(): Uint8Array {
    const bits = 15 | (11 << 14) | (1 << 28);
    const chunk = new Uint8Array([
      ...new TextEncoder().encode('VP8L'),
      10,
      0,
      0,
      0,
      0x2f,
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >>> 24) & 0xff,
      0,
      0,
      0,
      0,
      0,
    ]);
    const riff = new Uint8Array(12);
    riff.set(new TextEncoder().encode('RIFF'));
    new DataView(riff.buffer).setUint32(4, 4 + chunk.length, true);
    riff.set(new TextEncoder().encode('WEBP'), 8);
    const out = new Uint8Array(12 + chunk.length);
    out.set(riff);
    out.set(chunk, 12);
    return out;
  }

  it('turns a simple file into VP8X with the EXIF flag, canvas size, alpha and an EXIF chunk', () => {
    const tiff = buildExif(PHONE, { keepGps: false });
    const out = insertExif(vp8l(), 'webp', tiff);
    const view = new DataView(out.buffer);
    const fourcc = (at: number) => new TextDecoder().decode(out.subarray(at, at + 4));
    expect(fourcc(0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(out.length - 8);
    expect(fourcc(12)).toBe('VP8X');
    expect(out[20] & 0x08).toBe(0x08); // EXIF
    expect(out[20] & 0x10).toBe(0x10); // alpha, from the VP8L header
    expect(out[24] | (out[25] << 8) | (out[26] << 16)).toBe(15); // width - 1
    expect(out[27] | (out[28] << 8) | (out[29] << 16)).toBe(11); // height - 1
    expect(fourcc(30)).toBe('VP8L');
    const exifAt = out.length - 8 - tiff.length - (tiff.length % 2);
    expect(fourcc(exifAt)).toBe('EXIF');
    expect(out.subarray(exifAt + 8, exifAt + 8 + tiff.length)).toEqual(tiff);
  });
});

describe('stripJpegMetadata', () => {
  it('drops EXIF/XMP, IPTC and comments; keeps JFIF, ICC and Adobe segments', async () => {
    const photo = new Uint8Array(await (await phonePhoto()).arrayBuffer());
    // Add an ICC (APP2) and a comment (COM) after SOI.
    const icc = new Uint8Array([
      0xff,
      0xe2,
      0x00,
      0x0e,
      ...new TextEncoder().encode('ICC_PROFILE\0'),
    ]);
    const com = new Uint8Array([0xff, 0xfe, 0x00, 0x07, ...new TextEncoder().encode('hello')]);
    const withExtras = new Uint8Array([
      ...photo.subarray(0, 2),
      ...icc,
      ...com,
      ...photo.subarray(2),
    ]);

    const clean = stripJpegMetadata(withExtras);
    expect(await exifr.parse(blob(clean))).toBeUndefined();
    const text = new TextDecoder('latin1').decode(clean);
    expect(text).toContain('ICC_PROFILE');
    expect(text).not.toContain('hello');
    expect(text).not.toContain('Exif');
    const { loadImage } = await import('canvas');
    expect((await loadImage(Buffer.from(clean))).width).toBe(16); // still a valid JPEG
  });
});
