// Video fast path: the browser's own (often hardware) codecs through WebCodecs,
// with mediabunny doing the demuxing and muxing. It streams from the File
// instead of copying it into a wasm heap, and a 720p re-encode that takes
// ffmpeg.wasm a minute finishes in seconds.
//
// It only takes a job when it can make the same file ffmpeg would: the same
// container, the target's usual codecs, and every primary track kept. When it
// can't (no WebCodecs, a codec this browser can't decode or encode, a source
// mediabunny can't read), convertWithWebCodecs returns null and the caller
// runs ffmpeg.wasm as before.

import type { Conversion, Quality } from 'mediabunny';
import type { ConversionSettings } from './types';
import { mimeFor } from './formats';

type VideoCodec = 'avc' | 'vp9';
type AudioCodec = 'aac' | 'opus' | 'pcm-s16';

const SOURCES = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv']);

// H.264 + AAC for the ISO/Matroska containers, as buildFfmpegArgs uses. WebM
// gets VP9 + Opus here: ffmpeg.wasm only avoids them because its builds of
// libvpx-vp9 and libopus crash, and the browser's don't.
const TARGETS: Record<string, { video?: VideoCodec; audio: AudioCodec }> = {
  mp4: { video: 'avc', audio: 'aac' },
  mov: { video: 'avc', audio: 'aac' },
  mkv: { video: 'avc', audio: 'aac' },
  webm: { video: 'vp9', audio: 'opus' },
  wav: { audio: 'pcm-s16' },
};

/** Whether the pair is one this path handles and the browser has WebCodecs. */
export function webCodecsCandidate(sourceExt: string, targetExt: string): boolean {
  return (
    SOURCES.has(sourceExt.toLowerCase()) &&
    !!TARGETS[targetExt.toLowerCase()] &&
    typeof globalThis.VideoEncoder === 'function' &&
    typeof globalThis.AudioEncoder === 'function'
  );
}

/**
 * The ffmpeg CRF slider as a WebCodecs quality tier. Encoders here take a
 * bitrate, not a CRF; mediabunny's tiers scale the bitrate with resolution
 * and codec, which tracks what a CRF means better than any fixed number.
 */
export function crfToQualityTier(crf: number): 'veryHigh' | 'high' | 'medium' | 'low' | 'veryLow' {
  if (crf <= 18) return 'veryHigh';
  if (crf <= 23) return 'high';
  if (crf <= 28) return 'medium';
  if (crf <= 35) return 'low';
  return 'veryLow';
}

/** The trim settings as mediabunny's range; same rules as ffmpeg's trimArgs. */
export function trimRange(
  settings?: Partial<ConversionSettings>,
): { start?: number; end?: number } | undefined {
  const start = Math.max(0, settings?.trimStart ?? 0);
  const end = settings?.trimEnd ?? 0;
  if (!start && !(end > start)) return undefined;
  return { ...(start ? { start } : {}), ...(end > start ? { end } : {}) };
}

/**
 * The output size for a max width, as ffmpeg's scale='min(W,iw)':-2 gives it:
 * only ever smaller, aspect kept, both sides even (H.264 and VP9 need that).
 */
export function fitWidth(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } | null {
  if (!(maxWidth > 0) || width <= maxWidth) return null;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(maxWidth), height: even((height * maxWidth) / width) };
}

async function downscale(
  input: {
    getPrimaryVideoTrack(): Promise<{ displayWidth: number; displayHeight: number } | null>;
  },
  maxWidth: number,
): Promise<{ width?: number; height?: number; fit?: 'fill' }> {
  if (!(maxWidth > 0)) return {};
  const track = await input.getPrimaryVideoTrack();
  const size = track && fitWidth(track.displayWidth, track.displayHeight, maxWidth);
  return size ? { ...size, fit: 'fill' } : {};
}

let active: Conversion | null = null;
// Bumped by every cancel, so one that lands while a job is still probing its
// input (before execute starts) is not lost.
let generation = 0;

/** Stops the conversion in flight, if any; its execute() then throws. */
export function cancelWebCodecs(): void {
  generation++;
  void active?.cancel();
}

/**
 * Converts on WebCodecs, or returns null when this job should go to ffmpeg.
 * A cancel rethrows (the caller must not start ffmpeg); any other failure
 * mid-way returns null too, so the job still completes on the slow path.
 */
export async function convertWithWebCodecs(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob | null> {
  if (!webCodecsCandidate(sourceExt, targetExt)) return null;
  // mediabunny trims but can't cut a section out or draw subtitles: ffmpeg does those.
  // Nor lossless (CRF 0): its encoders only take a bitrate.
  if (
    (settings?.cutEnd ?? 0) > (settings?.cutStart ?? 0) ||
    settings?.subtitleFile ||
    settings?.videoQuality === 0
  ) {
    return null;
  }
  const started = generation;
  const target = TARGETS[targetExt.toLowerCase()];
  const mb = await import('mediabunny');

  const tiers: Record<ReturnType<typeof crfToQualityTier>, Quality> = {
    veryHigh: mb.QUALITY_VERY_HIGH,
    high: mb.QUALITY_HIGH,
    medium: mb.QUALITY_MEDIUM,
    low: mb.QUALITY_LOW,
    veryLow: mb.QUALITY_VERY_LOW,
  };
  const formats = {
    mp4: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    mov: () => new mb.MovOutputFormat({ fastStart: 'in-memory' }),
    mkv: () => new mb.MkvOutputFormat(),
    webm: () => new mb.WebMOutputFormat(),
    wav: () => new mb.WavOutputFormat(),
  } as Record<string, () => InstanceType<typeof mb.OutputFormat>>;

  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  let conversion: Conversion | null = null;
  try {
    const output = new mb.Output({
      format: formats[targetExt.toLowerCase()](),
      target: new mb.BufferTarget(),
    });
    const bitrate = (settings?.audioBitrate ?? 192) * 1000;
    // Muting drops the audio outright: nothing to encode or copy.
    const audioTrack = settings?.mute ? null : await input.getPrimaryAudioTrack();

    // Re-encode audio at the chosen bitrate when the browser can; otherwise
    // copy it if it is already in the target codec (AAC into MP4 on Linux
    // Chrome, which has no AAC encoder); otherwise leave the job to ffmpeg.
    let audio: Parameters<typeof mb.Conversion.init>[0]['audio'] = { discard: true };
    if (audioTrack) {
      const lossless = target.audio === 'pcm-s16';
      if (
        lossless ||
        (await mb.canEncodeAudio(target.audio, {
          bitrate,
          numberOfChannels: audioTrack.numberOfChannels,
          sampleRate: audioTrack.sampleRate,
        }))
      ) {
        audio = lossless
          ? { codec: target.audio, forceTranscode: true }
          : { codec: target.audio, bitrate, forceTranscode: true };
      } else if (audioTrack.codec === target.audio) {
        audio = { codec: target.audio };
      } else {
        return null;
      }
    }

    conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: trimRange(settings),
      video: target.video
        ? {
            ...(await downscale(input, settings?.videoMaxWidth ?? 0)),
            codec: target.video,
            quality: tiers[crfToQualityTier(settings?.videoQuality ?? 23)],
            // Always re-encode, so the quality setting means what it says.
            forceTranscode: true,
          }
        : { discard: true },
      audio,
      showWarnings: false,
    });
    // A track dropped for any reason but our own discard (no decoder, no
    // encoder) would give a different file than ffmpeg: a silent video, say.
    const dropped = conversion.discardedTracks.some((t) => t.reason !== 'discarded_by_user');
    if (!conversion.isValid || dropped) return null;

    if (generation !== started) throw new mb.ConversionCanceledError();
    conversion.onProgress = (p) => onProgress?.(Math.min(95, Math.round(10 + p * 85)));
    active = conversion;
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) return null;
    onProgress?.(100);
    return new Blob([buffer], { type: mimeFor(targetExt) });
  } catch (err) {
    if (err instanceof mb.ConversionCanceledError) throw err;
    console.warn('WebCodecs conversion failed; falling back to FFmpeg.', err);
    return null;
  } finally {
    if (active === conversion) active = null;
    input.dispose();
  }
}
