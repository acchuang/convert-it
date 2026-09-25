import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crfToQualityTier, fitWidth, trimRange } from '@/lib/webcodecs-converter';

describe('crfToQualityTier', () => {
  it('maps the CRF slider onto quality tiers, default CRF 23 → high', () => {
    expect([0, 18, 19, 23, 24, 28, 30, 35, 40, 51].map(crfToQualityTier)).toEqual([
      'veryHigh',
      'veryHigh',
      'high',
      'high',
      'medium',
      'medium',
      'low',
      'low',
      'veryLow',
      'veryLow',
    ]);
  });
});

describe('fitWidth', () => {
  it('matches ffmpeg scale=min(W,iw):-2 — down only, aspect kept, even sides', () => {
    expect(fitWidth(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
    expect(fitWidth(1920, 1080, 854)).toEqual({ width: 854, height: 480 });
    expect(fitWidth(1000, 750, 333)).toEqual({ width: 334, height: 250 });
    expect(fitWidth(640, 360, 1280)).toBeNull();
    expect(fitWidth(1920, 1080, 0)).toBeNull();
  });
});

describe('trimRange', () => {
  it('matches the ffmpeg trim rules', () => {
    expect(trimRange({ trimStart: 0, trimEnd: 0 })).toBeUndefined();
    expect(trimRange({ trimStart: 2, trimEnd: 7 })).toEqual({ start: 2, end: 7 });
    expect(trimRange({ trimStart: 5, trimEnd: 5 })).toEqual({ start: 5 });
    expect(trimRange({ trimStart: 0, trimEnd: 4 })).toEqual({ end: 4 });
  });
});

// A fake mediabunny: enough of Input/Output/Conversion to drive every
// decision convertWithWebCodecs makes, and to record what it asked for.
describe('convertWithWebCodecs', () => {
  class ConversionCanceledError extends Error {}
  let world: {
    audioTrack: { codec: string; numberOfChannels: number; sampleRate: number } | null;
    canEncodeAudio: boolean;
    discarded: { reason: string }[];
    isValid: boolean;
    execute: () => Promise<void>;
  };
  let initOptions: Record<string, unknown> | undefined;
  let conversion: { cancel: ReturnType<typeof vi.fn> } | undefined;
  let disposed: number;

  beforeEach(() => {
    vi.resetModules();
    world = {
      audioTrack: { codec: 'opus', numberOfChannels: 2, sampleRate: 48000 },
      canEncodeAudio: true,
      discarded: [],
      isValid: true,
      execute: async () => {},
    };
    initOptions = undefined;
    disposed = 0;
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('AudioEncoder', class {});
    vi.doMock('mediabunny', () => {
      class Format {}
      return {
        QUALITY_VERY_HIGH: 'q5',
        QUALITY_HIGH: 'q4',
        QUALITY_MEDIUM: 'q3',
        QUALITY_LOW: 'q2',
        QUALITY_VERY_LOW: 'q1',
        ALL_FORMATS: [],
        ConversionCanceledError,
        OutputFormat: Format,
        Mp4OutputFormat: Format,
        MovOutputFormat: Format,
        MkvOutputFormat: Format,
        WebMOutputFormat: Format,
        WavOutputFormat: Format,
        BlobSource: class {},
        BufferTarget: class {
          buffer: ArrayBuffer | null = null;
        },
        Input: class {
          async getPrimaryAudioTrack() {
            return world.audioTrack;
          }
          dispose() {
            disposed++;
          }
        },
        Output: class {
          target: { buffer: ArrayBuffer | null };
          constructor({ target }: { target: { buffer: ArrayBuffer | null } }) {
            this.target = target;
          }
        },
        canEncodeAudio: async () => world.canEncodeAudio,
        Conversion: {
          async init(options: { output: { target: { buffer: ArrayBuffer | null } } }) {
            initOptions = options as unknown as Record<string, unknown>;
            conversion = {
              cancel: vi.fn(async () => {}),
            };
            return {
              ...conversion,
              isValid: world.isValid,
              discardedTracks: world.discarded,
              onProgress: undefined as ((p: number) => void) | undefined,
              async execute() {
                await world.execute();
                this.onProgress?.(1);
                options.output.target.buffer = new Uint8Array([7, 7]).buffer;
              },
            };
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.doUnmock('mediabunny');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const file = () => new File(['x'], 'clip.mkv');
  const settings = { videoQuality: 30, audioBitrate: 128 } as never;
  const load = () => import('@/lib/webcodecs-converter');

  it('converts, re-encoding video at the chosen tier and audio at the chosen bitrate', async () => {
    const { convertWithWebCodecs } = await load();
    const progress: number[] = [];
    const blob = await convertWithWebCodecs(file(), 'mkv', 'webm', settings, (p) =>
      progress.push(p),
    );
    expect(blob?.type).toBe('video/webm');
    expect(blob?.size).toBe(2);
    expect(initOptions).toMatchObject({
      tracks: 'primary',
      video: { codec: 'vp9', quality: 'q2', forceTranscode: true },
      audio: { codec: 'opus', bitrate: 128000, forceTranscode: true },
    });
    expect(progress.at(-1)).toBe(100);
    expect(disposed).toBe(1);
  });

  it('mute discards the audio without probing it', async () => {
    const { convertWithWebCodecs } = await load();
    world.audioTrack = { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 };
    world.canEncodeAudio = false; // would otherwise send the job to ffmpeg
    const blob = await convertWithWebCodecs(file(), 'mkv', 'webm', {
      ...(settings as object),
      mute: true,
    } as never);
    expect(blob).not.toBeNull();
    expect(initOptions?.audio).toEqual({ discard: true });
  });

  it('leaves cuts, burnt-in subtitles and lossless to ffmpeg', async () => {
    const { convertWithWebCodecs } = await load();
    const base = settings as object;
    expect(
      await convertWithWebCodecs(file(), 'mkv', 'webm', {
        ...base,
        cutStart: 1,
        cutEnd: 2,
      } as never),
    ).toBeNull();
    expect(
      await convertWithWebCodecs(file(), 'mkv', 'webm', {
        ...base,
        subtitleFile: new File([''], 's.srt'),
      } as never),
    ).toBeNull();
    expect(
      await convertWithWebCodecs(file(), 'mkv', 'mp4', { ...base, videoQuality: 0 } as never),
    ).toBeNull();
    expect(initOptions).toBeUndefined();
  });

  it('passes the trim through', async () => {
    const { convertWithWebCodecs } = await load();
    await convertWithWebCodecs(file(), 'mkv', 'webm', {
      ...(settings as object),
      trimStart: 1,
      trimEnd: 3,
    } as never);
    expect(initOptions?.trim).toEqual({ start: 1, end: 3 });
  });

  it('declines pairs it does not handle, and browsers without WebCodecs', async () => {
    const { convertWithWebCodecs } = await load();
    expect(await convertWithWebCodecs(file(), 'avi', 'mp4')).toBeNull();
    expect(await convertWithWebCodecs(file(), 'mp4', 'mp3')).toBeNull();
    vi.stubGlobal('VideoEncoder', undefined);
    expect(await convertWithWebCodecs(file(), 'mp4', 'webm')).toBeNull();
    expect(initOptions).toBeUndefined();
  });

  it('copies audio already in the target codec when the browser cannot encode it', async () => {
    world.canEncodeAudio = false;
    world.audioTrack = { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 };
    const { convertWithWebCodecs } = await load();
    expect(await convertWithWebCodecs(file(), 'mov', 'mp4')).not.toBeNull();
    expect(initOptions?.audio).toEqual({ codec: 'aac' });
  });

  it('leaves the job to ffmpeg when the audio can be neither encoded nor copied', async () => {
    world.canEncodeAudio = false; // Opus source, AAC target, no AAC encoder
    const { convertWithWebCodecs } = await load();
    expect(await convertWithWebCodecs(file(), 'webm', 'mp4')).toBeNull();
    expect(initOptions).toBeUndefined();
    expect(disposed).toBe(1);
  });

  it('leaves the job to ffmpeg rather than drop a track', async () => {
    world.discarded = [{ reason: 'no_encodable_target_codec' }];
    const { convertWithWebCodecs } = await load();
    expect(await convertWithWebCodecs(file(), 'webm', 'mp4')).toBeNull();
  });

  it('extracts audio to WAV with the video discarded', async () => {
    world.discarded = [{ reason: 'discarded_by_user' }];
    const { convertWithWebCodecs } = await load();
    const blob = await convertWithWebCodecs(file(), 'webm', 'wav');
    expect(blob?.type).toBe('audio/wav');
    expect(initOptions).toMatchObject({
      video: { discard: true },
      audio: { codec: 'pcm-s16' },
    });
  });

  it('falls back to ffmpeg when the conversion fails mid-way', async () => {
    world.execute = async () => {
      throw new Error('EncodingError: encoder crashed');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { convertWithWebCodecs } = await load();
    expect(await convertWithWebCodecs(file(), 'mkv', 'webm')).toBeNull();
  });

  it('rethrows a cancel instead of handing the job to ffmpeg', async () => {
    const { convertWithWebCodecs, cancelWebCodecs } = await load();
    let release!: () => void;
    world.execute = () =>
      new Promise((_, reject) => {
        release = () => reject(new ConversionCanceledError('canceled'));
      });
    const job = convertWithWebCodecs(file(), 'mkv', 'webm');
    await vi.waitFor(() => expect(conversion).toBeDefined());
    await vi.waitFor(() => expect(release).toBeDefined());
    cancelWebCodecs();
    expect(conversion!.cancel).toHaveBeenCalled();
    release();
    await expect(job).rejects.toBeInstanceOf(ConversionCanceledError);
  });

  it('honours a cancel that lands before the conversion starts', async () => {
    const { convertWithWebCodecs, cancelWebCodecs } = await load();
    const job = convertWithWebCodecs(file(), 'mkv', 'webm');
    cancelWebCodecs(); // still loading mediabunny / probing the input
    await expect(job).rejects.toBeInstanceOf(ConversionCanceledError);
  });
});
