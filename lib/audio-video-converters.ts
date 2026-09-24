import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { ConversionSettings } from './types';
import { mimeFor } from './formats';

// Self-hosted on R2 rather than unpkg: a third-party CDN is both a single point of
// failure and an unsigned-wasm supply-chain hole, and Cloudflare Pages rejects files
// over 25MiB so the 31MB core cannot live in public/. Set this to the R2 custom domain
// (not the rate-limited *.r2.dev URL) and allow the Pages origin in the bucket's CORS.
// Inlined at build time by the static export, so a rebuild is needed to change it.
const FFMPEG_BASE_URL = process.env.NEXT_PUBLIC_FFMPEG_BASE_URL;

// Optional: where @ffmpeg/core-mt's three files live (same bucket, its own
// directory, since the file names are the same). Unset, media always runs on
// the single-threaded core.
const FFMPEG_MT_BASE_URL = process.env.NEXT_PUBLIC_FFMPEG_MT_BASE_URL;

// SHA-256 of @ffmpeg/core@0.12.10 dist/umd, the build uploaded to R2. The core
// is 31 MB of code fetched cross-origin at runtime, so it is checked before it
// runs: a tampered or swapped file on the CDN fails loudly instead of executing
// with access to the user's files. After a core upgrade, regenerate with
// `sha256sum node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.{js,wasm}`.
export const FFMPEG_CORE_SHA256 = {
  'ffmpeg-core.js': 'b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21',
  'ffmpeg-core.wasm': '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',
} as const;

// Same for @ffmpeg/core-mt@0.12.10 dist/umd (`npm pack @ffmpeg/core-mt@0.12.10`).
export const FFMPEG_CORE_MT_SHA256 = {
  'ffmpeg-core.js': '62f5f5f468a37861da12c4581c321bb5ca8ba2f7b776377e08dd2ab72de293f9',
  'ffmpeg-core.wasm': 'be2c97605366b78f3f13e21b52e81a55a79e1f29c133b03a68ec187b1a2ec41a',
  'ffmpeg-core.worker.js': '97322a227c5f3d5ccfd0d0825890a6deeba137106a09b633ca75cadf49ddd2cb',
} as const;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  // Digest a view, not the bare buffer: every WebCrypto accepts a Uint8Array,
  // while Node 20's rejects an ArrayBuffer from another realm (fetch under
  // jsdom), which is where the tests run.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetches one core file, checks it against the pinned hash, and returns a blob:
 * URL of the verified bytes. The worker loads that blob, not the network URL,
 * so what runs is exactly what was checked; there is no second fetch that
 * could return something else.
 */
async function verifiedBlobUrl(
  base: string,
  name: string,
  expected: string,
  type: string,
): Promise<string> {
  const res = await fetch(`${base}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  if ((await sha256Hex(data)) !== expected) {
    throw new Error(`${name} failed its integrity check — refusing to run it`);
  }
  return URL.createObjectURL(new Blob([data], { type }));
}

/**
 * Whether to try the multi-threaded core. It needs SharedArrayBuffer, which
 * browsers only expose to cross-origin isolated pages (COOP + COEP in
 * _headers), and it reserves 1 GiB of shared memory and a pool of 32 threads
 * up front, so small devices stay on the single-threaded core. deviceMemory
 * is Chromium-only; elsewhere a failed load falls back instead.
 */
export function multiThreadEligible(env: {
  isolated: boolean;
  cores: number;
  memoryGb?: number;
}): boolean {
  return env.isolated && env.cores >= 4 && (env.memoryGb === undefined || env.memoryGb >= 4);
}

function browserEnv() {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  return {
    isolated: globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function',
    cores: nav?.hardwareConcurrency ?? 1,
    memoryGb: nav?.deviceMemory,
  };
}

type CoreMode = 'mt' | 'st';

let ffmpeg: FFmpeg | null = null;
let ffmpegMode: CoreMode | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
// Set once the multi-threaded core fails to load or crashes; the rest of the
// session uses the single-threaded one.
let multiThreadBroken = false;
// Blob URLs the live instance still needs (see loadCore).
let pinnedUrls: string[] = [];

async function loadCore(mode: CoreMode): Promise<FFmpeg> {
  const base = (mode === 'mt' ? FFMPEG_MT_BASE_URL : FFMPEG_BASE_URL)!;
  const hashes: Record<string, string> = mode === 'mt' ? FFMPEG_CORE_MT_SHA256 : FFMPEG_CORE_SHA256;
  const file = (name: string, type: string) => verifiedBlobUrl(base, name, hashes[name], type);
  const urls: string[] = [];
  let ff: FFmpeg | undefined;
  try {
    const [coreURL, wasmURL, workerURL] = await Promise.all([
      file('ffmpeg-core.js', 'text/javascript'),
      file('ffmpeg-core.wasm', 'application/wasm'),
      mode === 'mt' ? file('ffmpeg-core.worker.js', 'text/javascript') : undefined,
    ]);
    urls.push(coreURL, wasmURL, ...(workerURL ? [workerURL] : []));
    ff = new FFmpeg();
    await ff.load({ coreURL, wasmURL, workerURL });
    // The compiled wasm is handed to every thread, so its 32 MB blob can go.
    // A thread started after load imports the core JS and the thread script
    // by URL, so the multi-threaded core keeps those two (130 KB) alive.
    URL.revokeObjectURL(wasmURL);
    if (workerURL) pinnedUrls = [coreURL, workerURL];
    else URL.revokeObjectURL(coreURL);
    return ff;
  } catch (err) {
    ff?.terminate();
    for (const url of urls) URL.revokeObjectURL(url);
    throw err;
  }
}

// A failed load is not remembered: the next conversion tries again. Caching the
// error meant one flaky fetch of the 31 MB core disabled audio and video until
// the page was reloaded.
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    try {
      if (!FFMPEG_BASE_URL) {
        throw new Error('NEXT_PUBLIC_FFMPEG_BASE_URL is not set');
      }
      if (FFMPEG_MT_BASE_URL && !multiThreadBroken && multiThreadEligible(browserEnv())) {
        try {
          ffmpeg = await loadCore('mt');
          ffmpegMode = 'mt';
          return ffmpeg;
        } catch (err) {
          multiThreadBroken = true;
          console.warn('Multi-threaded FFmpeg did not load; using the single-threaded core.', err);
        }
      }
      ffmpeg = await loadCore('st');
      ffmpegMode = 'st';
      return ffmpeg;
    } catch (err) {
      ffmpegLoading = null;
      throw new Error(`Failed to load FFmpeg: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  return ffmpegLoading;
}

/** The core the live instance runs, if one is loaded. */
export function ffmpegCoreMode(): CoreMode | null {
  return ffmpegMode;
}

// One FFmpeg instance backs every job, and every job writes to the same
// input.<ext> / output.<ext> pair in its virtual FS. "Convert all" fires jobs
// concurrently, so without this queue two videos would overwrite each other's
// files mid-exec and both come back wrong. Serialising also matches what the
// single wasm heap can actually do.
let ffmpegQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = ffmpegQueue.then(work, work);
  ffmpegQueue = run.catch(() => {});
  return run;
}

function dropInstance(): void {
  ffmpeg?.terminate();
  ffmpeg = null;
  ffmpegMode = null;
  ffmpegLoading = null;
  for (const url of pinnedUrls) URL.revokeObjectURL(url);
  pinnedUrls = [];
}

/**
 * Kills the shared instance. wasm cannot be interrupted, so this is the only
 * way to stop an exec in flight; the next conversion reloads the core.
 */
export function terminateFFmpeg(): void {
  dropInstance();
  ffmpegQueue = Promise.resolve();
}

const VIDEO_EXTS = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v', '3gp'];
const AUDIO_EXTS = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma', 'opus'];

function getCategory(sourceExt: string): 'video' | 'audio' | null {
  const ext = sourceExt.toLowerCase();
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  return null;
}

// Audio-only outputs. `bitrate: false` marks the lossless codecs, which take no
// -b:a and must not be resampled.
export const AUDIO_CODECS: Record<string, { codec: string; bitrate: boolean }> = {
  mp3: { codec: 'libmp3lame', bitrate: true },
  wav: { codec: 'pcm_s16le', bitrate: false },
  aac: { codec: 'aac', bitrate: true },
  ogg: { codec: 'libvorbis', bitrate: true },
  flac: { codec: 'flac', bitrate: false },
  m4a: { codec: 'aac', bitrate: true },
};

// libvpx has no -preset; its speed knob is -cpu-used, 0 (slowest) … 5 at the
// "good" deadline.
const VP8_CPU_USED: Record<string, string> = {
  ultrafast: '5',
  superfast: '5',
  veryfast: '4',
  faster: '3',
  fast: '2',
  medium: '2',
  slow: '1',
  slower: '0',
  veryslow: '0',
};

// libvpx's CRF runs 4–63 (VP8 default 10) against x264's 0–51 (default 23).
// This keeps the slider's "lower is better" meaning: CRF 23 → 28, 18 → 22.
function crfToVp8(crf: number): string {
  return String(Math.min(63, Math.max(4, Math.round(crf * 1.2))));
}

// mpeg4 (AVI) and Sorenson (FLV) are not CRF encoders; they take a fixed
// quantiser, 1 (best) … 31. This maps the CRF slider onto it so the same
// setting still means "better" or "smaller": CRF 23 → q 5, CRF 51 → q 11.
function crfToQscale(crf: number): string {
  return String(Math.min(31, Math.max(1, Math.round(crf / 4.5))));
}

interface VideoContainer {
  video: (crf: number, preset: string) => string[];
  // Each muxer only accepts some audio codecs; WebM, for one, rejects AAC outright.
  audio: (kbps: number) => string[];
  extra?: string[];
}

const x264 = (crf: number, preset: string) => [
  '-c:v',
  'libx264',
  '-preset',
  preset,
  '-crf',
  String(crf),
  // 10-bit or 4:4:4 sources otherwise come out as High 4:4:4 H.264, which
  // browsers and QuickTime refuse to play.
  '-pix_fmt',
  'yuv420p',
];
const aac = (kbps: number) => ['-c:a', 'aac', '-b:a', `${kbps}k`];
const mp3 = (kbps: number) => ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', '44100'];

const VIDEO_CONTAINERS: Record<string, VideoContainer> = {
  mp4: { video: x264, audio: aac, extra: ['-movflags', '+faststart'] },
  mov: { video: x264, audio: aac, extra: ['-movflags', '+faststart'] },
  mkv: { video: x264, audio: aac },
  // VP8 + Vorbis, not VP9 + Opus. In @ffmpeg/core 0.12.10 libvpx-vp9 dies with
  // "memory access out of bounds" on every input, and libopus does the same on
  // any stereo source at its default complexity (a MediaRecorder clip is
  // enough). Both reproduced in Chromium and Node against the same wasm. VP8 and
  // Vorbis encode cleanly, both are valid WebM, and every browser plays them.
  // In constrained-quality mode -b:v is only a ceiling; CRF decides the quality.
  webm: {
    video: (crf, preset) => [
      '-c:v',
      'libvpx',
      '-crf',
      crfToVp8(crf),
      '-b:v',
      '4M',
      '-deadline',
      'good',
      '-cpu-used',
      VP8_CPU_USED[preset] ?? '2',
      '-pix_fmt',
      'yuv420p',
    ],
    audio: (kbps) => ['-c:a', 'libvorbis', '-b:a', `${kbps}k`],
  },
  avi: { video: (crf) => ['-c:v', 'mpeg4', '-q:v', crfToQscale(crf)], audio: mp3 },
  flv: { video: (crf) => ['-c:v', 'flv', '-q:v', crfToQscale(crf)], audio: mp3 },
};

/**
 * The ffmpeg command line for one conversion. Pure, so the per-container codec
 * choices are testable without loading the 31 MB core.
 */
export function buildFfmpegArgs(
  sourceExt: string,
  targetExt: string,
  inputName: string,
  outputName: string,
  settings?: Partial<ConversionSettings>,
): string[] {
  const category = getCategory(sourceExt);
  if (!category) throw new Error(`Unsupported file type: ${sourceExt}`);

  // `??`, not `||`: CRF 0 is lossless, not "unset".
  const crf = settings?.videoQuality ?? 23;
  const preset = settings?.videoPreset || 'medium';
  const kbps = settings?.audioBitrate ?? 192;

  const audioTarget = AUDIO_CODECS[targetExt];
  if (audioTarget) {
    // -vn also drops embedded cover art, which ogg and wav can't carry anyway.
    const args = ['-i', inputName, '-vn', '-c:a', audioTarget.codec];
    if (audioTarget.bitrate) args.push('-b:a', `${kbps}k`, '-ar', '44100');
    return [...args, '-y', outputName];
  }

  if (category === 'video' && targetExt === 'webp') {
    return [
      '-i',
      inputName,
      '-c:v',
      'libwebp',
      '-loop',
      '0',
      '-lossless',
      '0',
      '-q:v',
      '75',
      '-an',
      '-y',
      outputName,
    ];
  }

  const container = category === 'video' ? VIDEO_CONTAINERS[targetExt] : undefined;
  if (!container) throw new Error(`Unsupported conversion: ${sourceExt} → ${targetExt}`);

  return [
    '-i',
    inputName,
    ...container.video(crf, preset),
    ...container.audio(kbps),
    ...(container.extra ?? []),
    '-y',
    outputName,
  ];
}

function parseTimestamp(h: string, m: string, s: string): number {
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
}

/**
 * Watches ffmpeg's log for two things: progress, which is `time=` against the
 * input's `Duration:` (so a two-hour film no longer reads 95 % after ten
 * seconds), and the last few lines, which are the only useful part of an error.
 */
export function createLogWatcher(onProgress?: (pct: number) => void) {
  let duration = 0;
  const recent: string[] = [];

  const handler = ({ message }: { message: string }) => {
    recent.push(message);
    if (recent.length > 6) recent.shift();

    const d = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (d && !duration) duration = parseTimestamp(d[1], d[2], d[3]);

    const t = message.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (t && duration > 0) {
      const elapsed = parseTimestamp(t[1], t[2], t[3]);
      onProgress?.(Math.min(95, Math.round(10 + (elapsed / duration) * 85)));
    }
  };

  const tail = () =>
    recent
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(' · ')
      .slice(0, 300);

  return { handler, tail };
}

async function runMedia(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const ff = await getFFmpeg();
  const mode = ffmpegMode;
  try {
    return await execOnce(ff, file, sourceExt, targetExt, settings, onProgress);
  } catch (err) {
    // A crash (an abort or a wasm trap, not a clean non-zero exit) on the
    // multi-threaded core: retire it for the session and run the job again on
    // the single-threaded one. ffmpeg !== ff means a cancel dropped the
    // instance, which is not a crash.
    if (mode !== 'mt' || err instanceof FfmpegExitError || ffmpeg !== ff) throw err;
    console.warn('Multi-threaded FFmpeg failed; retrying on the single-threaded core.', err);
    multiThreadBroken = true;
    dropInstance();
    return execOnce(await getFFmpeg(), file, sourceExt, targetExt, settings, onProgress);
  }
}

/** FFmpeg ran to completion and reported failure: the input's fault, not the core's. */
class FfmpegExitError extends Error {}

async function execOnce(
  ff: FFmpeg,
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const inputName = `input.${sourceExt}`;
  const outputName = `output.${targetExt}`;
  const args = buildFfmpegArgs(sourceExt, targetExt, inputName, outputName, settings);

  const log = createLogWatcher(onProgress);
  ff.on('log', log.handler);
  try {
    await ff.writeFile(inputName, await fetchFile(file));
    const code = await ff.exec(args);
    // A non-zero exit leaves no output file, and readFile's "no such file"
    // told the user nothing. The log tail usually names the actual problem.
    if (code !== 0) {
      const detail = log.tail();
      throw new FfmpegExitError(
        `FFmpeg could not convert this file (exit ${code})${detail ? `: ${detail}` : ''}`,
      );
    }
    const outputData = (await ff.readFile(outputName)) as Uint8Array;
    onProgress?.(100);
    return new Blob([outputData.buffer as ArrayBuffer], {
      type: mimeFor(targetExt),
    });
  } finally {
    ff.off('log', log.handler);
    // Always clean up: a failed job used to leave up to 500 MB of input in
    // MEMFS for the next one to run out of memory on.
    await removeQuietly(ff, inputName);
    await removeQuietly(ff, outputName);
  }
}

// deleteFile rejects when the file was never written, or when a cancel already
// terminated the instance; neither is worth surfacing.
async function removeQuietly(ff: FFmpeg, path: string): Promise<void> {
  try {
    await ff.deleteFile(path);
  } catch {
    // already gone
  }
}

export function convertAudioVideo(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  return enqueue(() => runMedia(file, sourceExt, targetExt, settings, onProgress));
}

// Extract audio from video. Same pipeline: buildFfmpegArgs drops the video
// stream whenever the target is an audio format.
export function extractAudio(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  return enqueue(() => runMedia(file, sourceExt, targetExt, settings, onProgress));
}
