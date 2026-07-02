import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../image-converters', () => ({
  convertImage: vi.fn(async () => new Blob(['image-result'])),
  IMAGE_MIME_MAP: { jpg: 'image/jpeg', png: 'image/png' },
}));

vi.mock('../heic-converter', () => ({
  default: vi.fn(async () => new Blob(['heic-result'])),
}));

vi.mock('../avif-converter', () => ({
  default: vi.fn(async () => new Blob(['avif-result'])),
}));

vi.mock('../audio-video-converters', () => ({
  convertAudioVideo: vi.fn(async () => new Blob(['av-result'])),
  extractAudio: vi.fn(async () => new Blob(['audio-extract-result'])),
  AUDIO_CODECS: {
    mp3: { codec: 'libmp3lame', ext: 'mp3' },
    wav: { codec: 'pcm_s16le', ext: 'wav' },
    aac: { codec: 'aac', ext: 'aac' },
    ogg: { codec: 'libvorbis', ext: 'ogg' },
    flac: { codec: 'flac', ext: 'flac' },
    m4a: { codec: 'aac', ext: 'm4a' },
  },
}));

import {
  convertFile,
  getTargetFormats,
  getFormatInfo,
  getFileExtension,
  formatFileSize,
  CONVERSION_MAP,
  FORMATS,
} from '@/lib/converters';
import { convertImage } from '@/lib/image-converters';
import convertHeic from '@/lib/heic-converter';
import convertAvif from '@/lib/avif-converter';
import { convertAudioVideo, extractAudio } from '@/lib/audio-video-converters';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFileExtension', () => {
  it('extracts lowercase extension', () => {
    expect(getFileExtension('Photo.JPG')).toBe('jpg');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
  });

  it('returns the whole name lowercased when there is no dot', () => {
    expect(getFileExtension('noext')).toBe('noext');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('getFormatInfo', () => {
  it('finds a format case-insensitively', () => {
    expect(getFormatInfo('PNG')?.label).toBe('PNG');
    expect(getFormatInfo('png')?.category).toBe('image');
  });

  it('returns undefined for unknown extension', () => {
    expect(getFormatInfo('zzz')).toBeUndefined();
  });
});

describe('getTargetFormats / CONVERSION_MAP', () => {
  it('returns configured targets for a known source', () => {
    expect(getTargetFormats('jpg')).toEqual(CONVERSION_MAP.jpg);
    expect(getTargetFormats('jpg')).toContain('png');
  });

  it('returns empty array for unknown source', () => {
    expect(getTargetFormats('zzz')).toEqual([]);
  });

  it('merges registry-derived targets into image/video/audio maps', () => {
    // csv:json comes from CONVERTER_REGISTRY, not the static maps
    expect(CONVERSION_MAP.csv).toContain('json');
    expect(CONVERSION_MAP.csv).toContain('xlsx');
  });

  it('every FORMATS entry with outgoing conversions appears in CONVERSION_MAP', () => {
    for (const f of FORMATS) {
      if (CONVERSION_MAP[f.ext]) {
        expect(Array.isArray(CONVERSION_MAP[f.ext])).toBe(true);
      }
    }
  });
});

describe('convertFile dispatch', () => {
  it('routes heic source to the heic converter regardless of category lookup', async () => {
    const file = new File(['x'], 'photo.heic', { type: 'image/heic' });
    const blob = await convertFile(file, 'png');
    expect(convertHeic).toHaveBeenCalledTimes(1);
    expect(convertHeic).toHaveBeenCalledWith(file, 'png', undefined);
    expect(await blob.text()).toBe('heic-result');
  });

  it('routes avif source to the avif converter', async () => {
    const file = new File(['x'], 'photo.avif', { type: 'image/avif' });
    const blob = await convertFile(file, 'jpg');
    expect(convertAvif).toHaveBeenCalledTimes(1);
    expect(convertAvif).toHaveBeenCalledWith(file, 'jpg', undefined);
    expect(await blob.text()).toBe('avif-result');
  });

  it('routes plain image sources to convertImage', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const blob = await convertFile(file, 'jpg');
    expect(convertImage).toHaveBeenCalledTimes(1);
    expect(convertImage).toHaveBeenCalledWith(file, 'png', 'jpg', undefined);
    expect(await blob.text()).toBe('image-result');
    expect(convertHeic).not.toHaveBeenCalled();
    expect(convertAvif).not.toHaveBeenCalled();
  });

  it('routes video source to convertAudioVideo when target is a video/other format', async () => {
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4' });
    const blob = await convertFile(file, 'webm');
    expect(convertAudioVideo).toHaveBeenCalledTimes(1);
    expect(convertAudioVideo).toHaveBeenCalledWith(file, 'mp4', 'webm', undefined, undefined);
    expect(extractAudio).not.toHaveBeenCalled();
    expect(await blob.text()).toBe('av-result');
  });

  it('routes video source to extractAudio when target is an audio codec extension', async () => {
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4' });
    const blob = await convertFile(file, 'mp3');
    expect(extractAudio).toHaveBeenCalledTimes(1);
    expect(extractAudio).toHaveBeenCalledWith(file, 'mp4', 'mp3', undefined, undefined);
    expect(convertAudioVideo).not.toHaveBeenCalled();
    expect(await blob.text()).toBe('audio-extract-result');
  });

  it('routes audio source to convertAudioVideo (not extractAudio) even for audio-codec targets', async () => {
    const file = new File(['x'], 'song.wav', { type: 'audio/wav' });
    const blob = await convertFile(file, 'mp3');
    expect(convertAudioVideo).toHaveBeenCalledTimes(1);
    expect(convertAudioVideo).toHaveBeenCalledWith(file, 'wav', 'mp3', undefined, undefined);
    expect(extractAudio).not.toHaveBeenCalled();
    expect(await blob.text()).toBe('av-result');
  });

  it('passes settings and onProgress through for video/audio conversions', async () => {
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4' });
    const settings = { quality: 0.5 } as any;
    const onProgress = vi.fn();
    await convertFile(file, 'webm', settings, onProgress);
    expect(convertAudioVideo).toHaveBeenCalledWith(file, 'mp4', 'webm', settings, onProgress);
  });

  it('routes data/document sources through the CONVERTER_REGISTRY', async () => {
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    const blob = await convertFile(file, 'json');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed).toEqual([{ a: 1, b: 2 }]);
  });

  it('throws for an unsupported conversion pair', async () => {
    const file = new File(['x'], 'data.csv', { type: 'text/csv' });
    await expect(convertFile(file, 'pdf')).rejects.toThrow('Unsupported conversion: csv → pdf');
  });

  it('throws for a completely unknown source extension', async () => {
    const file = new File(['x'], 'file.zzz', { type: 'application/octet-stream' });
    await expect(convertFile(file, 'json')).rejects.toThrow('Unsupported conversion: zzz → json');
  });
});
