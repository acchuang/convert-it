import { afterEach, describe, it, expect, vi } from 'vitest';
import { getTargetFormats } from '@/lib/converters';
import {
  buildFfmpegArgs,
  trimArgs,
  createLogWatcher,
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
// letting ffmpeg.wasm fall back to a third-party CDN. The variable is inlined at
// module load, so each test unsets it and imports a fresh copy: whatever the
// surrounding environment has set (CI builds with the real CDN URL) must not
// turn this into a 31 MB download.
describe('missing NEXT_PUBLIC_FFMPEG_BASE_URL', () => {
  const file = new File(['not really a video'], 'clip.mp4', { type: 'video/mp4' });

  async function loadUnconfigured() {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_BASE_URL', undefined);
    return import('@/lib/audio-video-converters');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('convertAudioVideo rejects and names the missing variable', async () => {
    const mod = await loadUnconfigured();
    await expect(mod.convertAudioVideo(file, 'mp4', 'webm')).rejects.toThrow(
      /NEXT_PUBLIC_FFMPEG_BASE_URL is not set/,
    );
  });

  it('extractAudio rejects too', async () => {
    const mod = await loadUnconfigured();
    await expect(mod.extractAudio(file, 'mp4', 'mp3')).rejects.toThrow(
      /NEXT_PUBLIC_FFMPEG_BASE_URL is not set/,
    );
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

describe('video → GIF', () => {
  const args = (extra: Partial<typeof DEFAULT_SETTINGS> = {}) =>
    buildFfmpegArgs('mp4', 'gif', 'in.mp4', 'out.gif', { ...DEFAULT_SETTINGS, ...extra });
  const filter = (a: string[]) => a[a.indexOf('-filter_complex') + 1];

  it('builds a palette from the clip and maps every frame onto it', () => {
    const a = args();
    expect(filter(a)).toBe(
      "fps=12,scale='min(480,iw)':-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];" +
        '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    );
    expect(a.slice(-4)).toEqual(['-loop', '0', '-y', 'out.gif']);
    expect(a).not.toContain('-c:a');
  });

  it('frame rate and width come from the settings; width 0 keeps the source size', () => {
    expect(filter(args({ animFps: 8, animWidth: 320 }))).toMatch(/^fps=8,scale='min\(320,iw\)'/);
    expect(filter(args({ animWidth: 0 }))).toMatch(/^fps=12,split/);
  });

  it('animated WebP uses the same frame rate and width', () => {
    const a = buildFfmpegArgs('mp4', 'webp', 'in', 'out.webp', {
      ...DEFAULT_SETTINGS,
      animFps: 15,
    });
    expect(a[a.indexOf('-vf') + 1]).toBe("fps=15,scale='min(480,iw)':-2:flags=lanczos");
  });
});

describe('trim', () => {
  it('seeks with -ss and caps the length with -t, both before -i', () => {
    const a = buildFfmpegArgs('mp4', 'mkv', 'in.mp4', 'out.mkv', {
      ...DEFAULT_SETTINGS,
      trimStart: 2.5,
      trimEnd: 10,
    });
    expect(a.slice(0, 6)).toEqual(['-ss', '2.5', '-t', '7.5', '-i', 'in.mp4']);
  });

  it('no trim by default, and an end at or before the start means "to the end"', () => {
    expect(trimArgs(DEFAULT_SETTINGS)).toEqual([]);
    expect(trimArgs({ trimStart: 5, trimEnd: 5 })).toEqual(['-ss', '5']);
    expect(trimArgs({ trimStart: 0, trimEnd: 4 })).toEqual(['-t', '4']);
    expect(trimArgs({ trimStart: -3 })).toEqual([]);
  });

  it('applies to audio too', () => {
    const a = buildFfmpegArgs('wav', 'mp3', 'in.wav', 'out.mp3', {
      ...DEFAULT_SETTINGS,
      trimEnd: 30,
    });
    expect(a.slice(0, 4)).toEqual(['-t', '30', '-i', 'in.wav']);
  });
});

describe('resize and mute (video → video)', () => {
  const args = (extra: Partial<typeof DEFAULT_SETTINGS>) =>
    buildFfmpegArgs('mp4', 'webm', 'in.mp4', 'out.webm', { ...DEFAULT_SETTINGS, ...extra });

  it('scales down only, keeping an even height', () => {
    const a = args({ videoMaxWidth: 1280 });
    expect(a.slice(2, 4)).toEqual(['-vf', "scale='min(1280,iw)':-2"]);
    expect(args({ videoMaxWidth: 0 })).not.toContain('-vf');
  });

  it('mute drops the audio stream instead of encoding it', () => {
    const a = args({ mute: true });
    expect(a).toContain('-an');
    expect(a).not.toContain('-c:a');
    expect(args({})).toContain('-c:a');
  });
});
