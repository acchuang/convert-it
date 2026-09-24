import { describe, it, expect, vi } from 'vitest';
import { getTargetFormats } from '@/lib/converters';
import {
  buildFfmpegArgs,
  convertAudioVideo,
  createLogWatcher,
  extractAudio,
  FFMPEG_CORE_SHA256,
  sha256Hex,
} from '@/lib/audio-video-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

describe('VIDEO_CONVERSIONS includes webp', () => {
  const videoSources = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v', '3gp'];
  for (const source of videoSources) {
    it(`${source} can convert to webp`, () => {
      const targets = getTargetFormats(source);
      expect(targets).toContain('webp');
    });
  }
});

// The core is self-hosted, so an unset base URL must fail loudly here rather than
// letting ffmpeg.wasm fall back to a third-party CDN. vitest runs with it unset.
describe('missing NEXT_PUBLIC_FFMPEG_BASE_URL', () => {
  const file = new File(['not really a video'], 'clip.mp4', { type: 'video/mp4' });

  it('convertAudioVideo rejects and names the missing variable', async () => {
    await expect(convertAudioVideo(file, 'mp4', 'webm')).rejects.toThrow(
      /NEXT_PUBLIC_FFMPEG_BASE_URL is not set/,
    );
  });

  it('extractAudio rejects too', async () => {
    await expect(extractAudio(file, 'mp3')).rejects.toThrow(/FFmpeg/);
  });
});

describe('buildFfmpegArgs', () => {
  const args = (from: string, to: string, settings = DEFAULT_SETTINGS) =>
    buildFfmpegArgs(from, to, `input.${from}`, `output.${to}`, settings);
  const valueOf = (list: string[], flag: string) => list[list.indexOf(flag) + 1];

  it('WebM gets VP8 + Vorbis and libvpx speed flags, never AAC or -preset', () => {
    const a = args('mp4', 'webm');
    // Not libvpx-vp9 or libopus: both crash the bundled ffmpeg core (see VIDEO_CONTAINERS).
    expect(valueOf(a, '-c:v')).toBe('libvpx');
    expect(valueOf(a, '-c:a')).toBe('libvorbis');
    expect(a).not.toContain('aac');
    expect(a).not.toContain('-preset');
    expect(valueOf(a, '-crf')).toBe('28');
    expect(valueOf(a, '-cpu-used')).toBe('2');
  });

  it('MP4/MOV use x264 + AAC with faststart; MKV has no movflags', () => {
    for (const to of ['mp4', 'mov']) {
      const a = args('webm', to);
      expect(valueOf(a, '-c:v')).toBe('libx264');
      expect(valueOf(a, '-c:a')).toBe('aac');
      expect(valueOf(a, '-pix_fmt')).toBe('yuv420p');
      expect(a).toContain('-movflags');
    }
    expect(args('mp4', 'mkv')).not.toContain('-movflags');
  });

  it('AVI and FLV use a quantiser, not CRF, and MP3 audio', () => {
    for (const to of ['avi', 'flv']) {
      const a = args('mp4', to);
      expect(a).not.toContain('-crf');
      expect(a).not.toContain('-movflags');
      expect(valueOf(a, '-q:v')).toBe('5');
      expect(valueOf(a, '-c:a')).toBe('libmp3lame');
    }
  });

  it('keeps CRF 0 (lossless) instead of treating it as unset', () => {
    expect(valueOf(args('mp4', 'mkv', { ...DEFAULT_SETTINGS, videoQuality: 0 }), '-crf')).toBe('0');
  });

  it('audio targets drop the video stream and skip bitrate for lossless codecs', () => {
    const mp3 = args('mp4', 'mp3');
    expect(mp3).toContain('-vn');
    expect(valueOf(mp3, '-b:a')).toBe('192k');

    for (const to of ['wav', 'flac']) {
      const a = args('mp3', to);
      expect(a).toContain('-vn');
      expect(a).not.toContain('-b:a');
      expect(a).not.toContain('-ar');
    }
  });

  it('ends with the output file and rejects pairs it cannot build', () => {
    expect(args('mp4', 'webm').slice(-2)).toEqual(['-y', 'output.webm']);
    expect(() => args('mp3', 'mp4')).toThrow(/Unsupported conversion/);
    expect(() => args('xyz', 'mp4')).toThrow(/Unsupported file type/);
  });
});

describe('createLogWatcher', () => {
  it('reports progress against the input duration', () => {
    const seen: number[] = [];
    const { handler } = createLogWatcher((pct) => seen.push(pct));
    handler({ message: '  Duration: 00:02:00.00, start: 0.000000, bitrate: 1000 kb/s' });
    handler({ message: 'frame=  100 fps=25 time=00:01:00.00 bitrate=500kbits/s' });
    handler({ message: 'frame=  200 fps=25 time=00:02:00.00 bitrate=500kbits/s' });
    expect(seen).toEqual([53, 95]);
  });

  it('stays quiet until the duration is known', () => {
    const seen: number[] = [];
    const { handler } = createLogWatcher((pct) => seen.push(pct));
    handler({ message: 'frame=  1 time=00:00:05.00' });
    expect(seen).toEqual([]);
  });

  it('keeps the last lines for error messages', () => {
    const { handler, tail } = createLogWatcher();
    for (const message of ['a', 'b', 'c', 'Unknown encoder', '', 'Conversion failed!'])
      handler({ message });
    expect(tail()).toBe('c · Unknown encoder · Conversion failed!');
  });
});

describe('FFmpeg core integrity', () => {
  it('pins a SHA-256 for both core files', () => {
    for (const hash of Object.values(FFMPEG_CORE_SHA256)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex matches the known digest of "abc"', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await sha256Hex(data.buffer as ArrayBuffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('tampered FFmpeg core', () => {
  it('refuses to run a core whose bytes do not match the pinned hash', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_BASE_URL', 'https://cdn.example/core');
    const fetchMock = vi.fn(async () => new Response('self.evil = true'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const mod = await import('@/lib/audio-video-converters');
      const file = new File(['x'], 'a.mp4');
      await expect(mod.convertAudioVideo(file, 'mp4', 'webm')).rejects.toThrow(
        /failed its integrity check/,
      );
      expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/core/ffmpeg-core.js');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
