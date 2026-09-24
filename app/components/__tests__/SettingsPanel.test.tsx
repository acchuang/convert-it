import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SettingsPanel } from '@/app/components/SettingsPanel';
import { DEFAULT_SETTINGS } from '@/lib/types';

const t = (key: string) => key;
const groups = (source: string, target: string) => {
  cleanup(); // several calls per test: measure only this render
  render(
    <SettingsPanel
      sourceExt={source}
      targetExt={target}
      settings={DEFAULT_SETTINGS}
      onChange={vi.fn()}
      t={t}
    />,
  );
  const text = document.body.textContent ?? '';
  const has = (key: string) => text.includes(key);
  return {
    quality: has('job.quality'),
    resize: has('job.resize'),
    maxSize: has('job.maxSize'),
    bitrate: has('job.bitrate'),
    preset: has('job.preset'),
    delimiter: has('job.delimiter'),
    indent: has('job.indent'),
    pdfPages: has('job.pdfPages'),
    sheets: has('job.xlsxSheets'),
    fps: has('job.fps'),
    trim: has('job.trim'),
    pdfEdit: has('job.pdfPages2'),
    pdfCompress: has('job.pdfCompress'),
    pageSize: has('job.pdfPageSize'),
    videoSize: has('job.videoSize'),
    mute: has('job.audioTrack'),
    metadata: has('job.metadata'),
    ocr: has('job.ocrLanguage'),
    burn: has('job.burnSubtitles'),
    cut: has('job.cutOut'),
  };
};

describe('SettingsPanel shows what the route reads', () => {
  it('lossy image target: quality, resize and max size', () => {
    expect(groups('png', 'jpg')).toMatchObject({ quality: true, resize: true, maxSize: true });
  });

  it('PNG target: resize only; PNG is lossless, so no quality slider', () => {
    expect(groups('jpg', 'png')).toMatchObject({ quality: false, resize: true, maxSize: false });
  });

  it('.jpeg sources get the image toolbox too (the old check missed them)', () => {
    expect(groups('jpeg', 'webp')).toMatchObject({ quality: true, resize: true, maxSize: true });
  });

  it('video → video: CRF/preset and the audio bitrate it applies', () => {
    expect(groups('mp4', 'mkv')).toMatchObject({ preset: true, bitrate: true });
  });

  it('AVI/FLV have a fixed-quantiser encoder: quality but no speed preset', () => {
    expect(groups('mp4', 'avi')).toMatchObject({ quality: true, preset: false, bitrate: true });
  });

  it('video → GIF / animated WebP: frame rate, width and trim, no codec knobs', () => {
    for (const target of ['gif', 'webp']) {
      expect(groups('mp4', target)).toMatchObject({
        fps: true,
        trim: true,
        quality: false,
        preset: false,
        bitrate: false,
      });
    }
  });

  it('video → video can be resized and muted; extracting audio or making a GIF cannot', () => {
    expect(groups('mp4', 'mkv')).toMatchObject({ videoSize: true, mute: true });
    expect(groups('mp4', 'mp3')).toMatchObject({ videoSize: false, mute: false });
    expect(groups('mp4', 'gif')).toMatchObject({ videoSize: false, mute: false });
  });

  it('every media conversion can be trimmed; nothing else can', () => {
    expect(groups('mp4', 'mkv').trim).toBe(true);
    expect(groups('wav', 'mp3').trim).toBe(true);
    expect(groups('png', 'jpg').trim).toBe(false);
  });

  it('PDF tools: pages/rotate/split and compress for PDF → PDF, page size for image → PDF', () => {
    expect(groups('pdf', 'pdf')).toMatchObject({
      pdfEdit: true,
      pdfCompress: true,
      pageSize: false,
    });
    expect(groups('heic', 'pdf')).toMatchObject({ pageSize: true, pdfEdit: false, quality: false });
    expect(groups('pdf', 'png').pdfEdit).toBe(false);
  });

  it('metadata controls where EXIF can be read and written back', () => {
    expect(groups('jpg', 'png').metadata).toBe(true);
    expect(groups('heic', 'jpg').metadata).toBe(true);
    expect(groups('jpg', 'avif').metadata).toBe(false); // no EXIF writer for AVIF
    expect(groups('gif', 'png').metadata).toBe(false); // GIF carries none
  });

  it('OCR language for image → text and PDF text extraction', () => {
    expect(groups('png', 'txt').ocr).toBe(true);
    expect(groups('pdf', 'txt').ocr).toBe(true);
    expect(groups('pdf', 'png').ocr).toBe(false);
  });

  it('subtitle burn-in for video output only; the cut wherever there is a trim', () => {
    expect(groups('mp4', 'mkv')).toMatchObject({ burn: true, cut: true });
    expect(groups('mp4', 'gif')).toMatchObject({ burn: true, cut: true });
    expect(groups('mp4', 'mp3')).toMatchObject({ burn: false, cut: true });
    expect(groups('wav', 'mp3')).toMatchObject({ burn: false, cut: true });
  });

  it('lossless audio targets have no bitrate', () => {
    expect(groups('mp3', 'flac').bitrate).toBe(false);
    expect(groups('mp3', 'ogg').bitrate).toBe(true);
  });

  it('XLSX output has no CSV/JSON options; XLSX input has sheets', () => {
    expect(groups('csv', 'xlsx')).toMatchObject({ delimiter: false, indent: false });
    expect(groups('xlsx', 'csv')).toMatchObject({ delimiter: true, sheets: true });
  });

  it('PDF → image: pages plus the image toolbox', () => {
    expect(groups('pdf', 'png')).toMatchObject({ pdfPages: true, resize: true, quality: false });
  });
});
