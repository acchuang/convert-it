import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { multiThreadEligible } from '@/lib/audio-video-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

describe('multiThreadEligible', () => {
  it('needs cross-origin isolation', () => {
    expect(multiThreadEligible({ isolated: false, cores: 16, memoryGb: 16 })).toBe(false);
  });
  it('needs at least four cores', () => {
    expect(multiThreadEligible({ isolated: true, cores: 2 })).toBe(false);
    expect(multiThreadEligible({ isolated: true, cores: 4 })).toBe(true);
  });
  it('skips devices reporting under 4 GB, and trusts browsers that report nothing', () => {
    expect(multiThreadEligible({ isolated: true, cores: 8, memoryGb: 2 })).toBe(false);
    expect(multiThreadEligible({ isolated: true, cores: 8, memoryGb: 8 })).toBe(true);
    expect(multiThreadEligible({ isolated: true, cores: 8, memoryGb: undefined })).toBe(true);
  });
});

// Drives the loader against a fake ffmpeg.wasm: which core loads, and what
// happens when the multi-threaded one fails to load or crashes mid-job.
describe('core selection and fallback', () => {
  const ST = 'https://cdn.example/core';
  const MT = 'https://cdn.example/core-mt';
  let behaviour: { mtLoad: 'ok' | 'fail'; mtExec: 'ok' | 'crash' | 'exit1' };
  let loads: string[];
  let writes: Map<string, Uint8Array>;

  beforeEach(() => {
    vi.resetModules();
    behaviour = { mtLoad: 'ok', mtExec: 'ok' };
    loads = [];
    writes = new Map();
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_BASE_URL', ST);
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_MT_BASE_URL', MT);
    vi.stubGlobal('crossOriginIsolated', true);
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    // Every fetched file "is" its URL; the digest stub then answers with the
    // pinned hash for that file, so the integrity check passes.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(url)),
    );
    vi.doMock('@ffmpeg/util', () => ({ fetchFile: async () => new Uint8Array([1]) }));
    vi.doMock('@ffmpeg/ffmpeg', () => ({
      FFmpeg: class {
        mode = 'st';
        async load({ workerURL }: { workerURL?: string }) {
          this.mode = workerURL ? 'mt' : 'st';
          loads.push(this.mode);
          if (this.mode === 'mt' && behaviour.mtLoad === 'fail') throw new Error('OOM');
        }
        async exec() {
          if (this.mode === 'mt' && behaviour.mtExec === 'crash')
            throw new Error('RuntimeError: memory access out of bounds');
          return this.mode === 'mt' && behaviour.mtExec === 'exit1' ? 1 : 0;
        }
        async writeFile(path: string, data: Uint8Array) {
          writes.set(path, data);
        }
        async createDir(path: string) {
          writes.set(`${path}/`, new Uint8Array());
        }
        async readFile() {
          return new TextEncoder().encode(this.mode);
        }
        async deleteFile() {}
        on() {}
        off() {}
        terminate() {}
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('@ffmpeg/ffmpeg');
    vi.doUnmock('@ffmpeg/util');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function load() {
    const mod = await import('@/lib/audio-video-converters');
    const pinned: Record<string, Record<string, string>> = {
      [ST]: mod.FFMPEG_CORE_SHA256,
      [MT]: mod.FFMPEG_CORE_MT_SHA256,
    };
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (_alg, data) => {
      const url = new TextDecoder().decode(data as Uint8Array);
      const base = url.slice(0, url.lastIndexOf('/'));
      const hex = pinned[base][url.slice(base.length + 1)];
      return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16)).buffer;
    });
    const convert = async () => {
      const blob = await mod.convertAudioVideo(new File(['x'], 'a.mp4'), 'mp4', 'mkv');
      return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    };
    return { mod, convert };
  }

  it('uses the multi-threaded core when isolated and configured', async () => {
    const { mod, convert } = await load();
    expect(await convert()).toBe('mt');
    expect(mod.ffmpegCoreMode()).toBe('mt');
    expect(fetch).toHaveBeenCalledWith(`${MT}/ffmpeg-core.worker.js`);
  });

  it('stays single-threaded when the page is not cross-origin isolated', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    const { convert } = await load();
    expect(await convert()).toBe('st');
    expect(loads).toEqual(['st']);
    expect(fetch).not.toHaveBeenCalledWith(`${MT}/ffmpeg-core.js`);
  });

  it('stays single-threaded when no multi-threaded core is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_MT_BASE_URL', '');
    const { convert } = await load();
    expect(await convert()).toBe('st');
    expect(loads).toEqual(['st']);
  });

  it('falls back to single-threaded when the multi-threaded core fails to load', async () => {
    behaviour.mtLoad = 'fail';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { convert } = await load();
    expect(await convert()).toBe('st');
    expect(loads).toEqual(['mt', 'st']);
  });

  it('reruns a job that crashed the multi-threaded core, then stays single-threaded', async () => {
    behaviour.mtExec = 'crash';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mod, convert } = await load();
    expect(await convert()).toBe('st');
    expect(loads).toEqual(['mt', 'st']);
    mod.terminateFFmpeg(); // e.g. a cancel: the next job reloads, without retrying MT
    expect(await convert()).toBe('st');
    expect(loads).toEqual(['mt', 'st', 'st']);
  });

  it('skips ffmpeg entirely when WebCodecs takes the job, and cancels it on terminate', async () => {
    const cancelWebCodecs = vi.fn();
    vi.doMock('@/lib/webcodecs-converter', () => ({
      convertWithWebCodecs: async () => new Blob(['wc']),
      cancelWebCodecs,
    }));
    try {
      const { mod, convert } = await load();
      expect(await convert()).toBe('wc');
      expect(loads).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      mod.terminateFFmpeg();
      expect(cancelWebCodecs).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('@/lib/webcodecs-converter');
    }
  });

  it('burn-in writes the subtitles as ASS, shifted by the trim, and only the fonts they need', async () => {
    vi.stubEnv('NEXT_PUBLIC_FFMPEG_MT_BASE_URL', '');
    const { mod } = await load();
    const subs = new File(['1\n00:00:05,000 --> 00:00:07,000\n你好 world\n'], 'movie.srt');
    const blob = await mod.convertAudioVideo(new File(['x'], 'a.mp4'), 'mp4', 'mkv', {
      ...DEFAULT_SETTINGS,
      subtitleFile: subs,
      trimStart: 2,
    });
    expect(blob.size).toBeGreaterThan(0);
    const ass = new TextDecoder().decode(writes.get('burn.ass'));
    expect(ass).toContain('Dialogue: 0,0:00:03.00,0:00:05.00,Default');
    expect(ass).toContain('{\\fnNoto Sans SC}你好');
    expect([...writes.keys()].filter((k) => k.startsWith('/fonts/')).sort()).toEqual([
      '/fonts/',
      '/fonts/noto-sans-cjk-regular.ttf',
      '/fonts/noto-sans-regular.ttf',
    ]);
    expect(fetch).toHaveBeenCalledWith('/fonts/pdf/noto-sans-cjk-regular.ttf');
  });

  it('does not rerun a clean ffmpeg failure: that is the input, not the core', async () => {
    behaviour.mtExec = 'exit1';
    const { mod, convert } = await load();
    await expect(convert()).rejects.toThrow(/exit 1/);
    expect(loads).toEqual(['mt']);
    expect(mod.ffmpegCoreMode()).toBe('mt');
  });
});
