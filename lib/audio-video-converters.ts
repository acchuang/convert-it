import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { ConversionSettings } from './types';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
let ffmpegError: Error | null = null;

// Self-hosted on R2 rather than unpkg: a third-party CDN is both a single point of
// failure and an unsigned-wasm supply-chain hole, and Cloudflare Pages rejects files
// over 25MiB so the 31MB core cannot live in public/. Set this to the R2 custom domain
// (not the rate-limited *.r2.dev URL) and allow the Pages origin in the bucket's CORS.
// Inlined at build time by the static export, so a rebuild is needed to change it.
const FFMPEG_BASE_URL = process.env.NEXT_PUBLIC_FFMPEG_BASE_URL;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (ffmpegError) throw new Error(`FFmpeg unavailable: ${ffmpegError.message}`);
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    try {
      if (!FFMPEG_BASE_URL) {
        throw new Error('NEXT_PUBLIC_FFMPEG_BASE_URL is not set');
      }
      const ff = new FFmpeg();
      await ff.load({
        coreURL: `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
        wasmURL: `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
      });
      ffmpeg = ff;
      return ff;
    } catch (err) {
      ffmpegError = err instanceof Error ? err : new Error(String(err));
      ffmpegLoading = null;
      throw new Error(`Failed to load FFmpeg: ${ffmpegError.message}`);
    }
  })();

  return ffmpegLoading;
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

/**
 * Kills the shared instance. wasm cannot be interrupted, so this is the only
 * way to stop an exec in flight; the next conversion reloads the core.
 */
export function terminateFFmpeg(): void {
  ffmpeg?.terminate();
  ffmpeg = null;
  ffmpegLoading = null;
  ffmpegError = null;
  ffmpegQueue = Promise.resolve();
}

// Video codecs and presets
const VIDEO_CODECS: Record<string, { codec: string; ext: string }> = {
  mp4: { codec: 'libx264', ext: 'mp4' },
  webm: { codec: 'libvpx-vp9', ext: 'webm' },
  avi: { codec: 'mpeg4', ext: 'avi' },
  mov: { codec: 'libx264', ext: 'mov' },
  mkv: { codec: 'libx264', ext: 'mkv' },
  flv: { codec: 'flv', ext: 'flv' },
  webp: { codec: 'libwebp', ext: 'webp' },
};

// Audio codecs
export const AUDIO_CODECS: Record<string, { codec: string; ext: string }> = {
  mp3: { codec: 'libmp3lame', ext: 'mp3' },
  wav: { codec: 'pcm_s16le', ext: 'wav' },
  aac: { codec: 'aac', ext: 'aac' },
  ogg: { codec: 'libvorbis', ext: 'ogg' },
  flac: { codec: 'flac', ext: 'flac' },
  m4a: { codec: 'aac', ext: 'm4a' },
};

function getCategory(sourceExt: string): 'video' | 'audio' | null {
  const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v', '3gp'];
  const audioExts = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma', 'opus'];

  if (videoExts.includes(sourceExt.toLowerCase())) return 'video';
  if (audioExts.includes(sourceExt.toLowerCase())) return 'audio';
  return null;
}

const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  flv: 'video/x-flv',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
};

function makeProgressLogHandler(onProgress?: (pct: number) => void) {
  return ({ message }: { message: string }) => {
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch) {
      const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      onProgress?.(Math.min(95, 10 + (seconds / 10) * 85));
    }
  };
}

async function execWithProgress(ff: FFmpeg, args: string[], onProgress?: (pct: number) => void): Promise<void> {
  const logHandler = makeProgressLogHandler(onProgress);
  ff.on('log', logHandler);
  try {
    await ff.exec(args);
  } finally {
    ff.off('log', logHandler);
  }
}

export function convertAudioVideo(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  return enqueue(() => runConvertAudioVideo(file, sourceExt, targetExt, settings, onProgress));
}

async function runConvertAudioVideo(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  const category = getCategory(sourceExt);

  if (!category) {
    throw new Error(`Unsupported file type: ${sourceExt}`);
  }

  const inputName = `input.${sourceExt}`;
  const outputName = `output.${targetExt}`;

  const fileData = await fetchFile(file);
  await ff.writeFile(inputName, fileData);

  const args: string[] = [];

  if (category === 'video' && VIDEO_CODECS[targetExt]) {
    const config = VIDEO_CODECS[targetExt];

    if (targetExt === 'webp') {
      args.push(
        '-i', inputName,
        '-c:v', 'libwebp',
        '-loop', '0',
        '-lossless', '0',
        '-q:v', '75',
        '-an',
        '-y', outputName
      );
    } else {
      args.push(
        '-i', inputName,
        '-c:v', config.codec,
        '-preset', settings?.videoPreset || 'medium',
        '-crf', String(settings?.videoQuality || 23),
        '-c:a', 'aac',
        '-b:a', `${settings?.audioBitrate || 128}k`,
        '-movflags', '+faststart',
        '-y', outputName
      );
    }
  } else if (category === 'audio' && AUDIO_CODECS[targetExt]) {
    const config = AUDIO_CODECS[targetExt];

    args.push(
      '-i', inputName,
      '-c:a', config.codec,
      '-b:a', `${settings?.audioBitrate || 192}k`,
      '-ar', '44100',
      '-y', outputName
    );
  } else {
    args.push('-i', inputName, '-y', outputName);
  }

  await execWithProgress(ff, args, onProgress);

  const outputData = await ff.readFile(outputName) as Uint8Array;

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress?.(100);

  return new Blob([outputData.buffer as ArrayBuffer], { type: MIME_TYPES[targetExt] || 'application/octet-stream' });
}

// Extract audio from video
export function extractAudio(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  return enqueue(() => runExtractAudio(file, sourceExt, targetExt, settings, onProgress));
}

async function runExtractAudio(
  file: File,
  sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();

  const inputName = `input.${sourceExt}`;
  const outputName = `output.${targetExt}`;

  const fileData = await fetchFile(file);
  await ff.writeFile(inputName, fileData);

  const config = AUDIO_CODECS[targetExt];

  await execWithProgress(ff, [
    '-i', inputName,
    '-vn',
    '-c:a', config?.codec || 'aac',
    '-b:a', `${settings?.audioBitrate || 192}k`,
    '-ar', '44100',
    '-y', outputName,
  ], onProgress);

  const outputData = await ff.readFile(outputName) as Uint8Array;

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress?.(100);

  return new Blob([outputData.buffer as ArrayBuffer], { type: MIME_TYPES[targetExt] || 'audio/mpeg' });
}
