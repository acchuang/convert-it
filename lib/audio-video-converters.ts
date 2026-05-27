import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { ConversionSettings } from './types';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
let ffmpegError: Error | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (ffmpegError) throw new Error(`FFmpeg unavailable: ${ffmpegError.message}`);
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    try {
      const ff = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
      await ff.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
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
const AUDIO_CODECS: Record<string, { codec: string; ext: string }> = {
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

export async function convertAudioVideo(
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

  ff.on('log', ({ message }) => {
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch) {
      const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      onProgress?.(Math.min(95, 10 + (seconds / 10) * 85));
    }
  });

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

  await ff.exec(args);

  const outputData = await ff.readFile(outputName) as Uint8Array;

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress?.(100);

  const mimeTypes: Record<string, string> = {
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

  return new Blob([outputData.buffer as ArrayBuffer], { type: mimeTypes[targetExt] || 'application/octet-stream' });
}

// Extract audio from video
export async function extractAudio(
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

  ff.on('log', ({ message }) => {
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch) {
      const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      onProgress?.(Math.min(95, 10 + (seconds / 10) * 85));
    }
  });

  const config = AUDIO_CODECS[targetExt];

  await ff.exec([
    '-i', inputName,
    '-vn',
    '-c:a', config?.codec || 'aac',
    '-b:a', `${settings?.audioBitrate || 192}k`,
    '-ar', '44100',
    '-y', outputName,
  ]);

  const outputData = await ff.readFile(outputName) as Uint8Array;

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress?.(100);

  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
  };

  return new Blob([outputData.buffer as ArrayBuffer], { type: mimeTypes[targetExt] || 'audio/mpeg' });
}
