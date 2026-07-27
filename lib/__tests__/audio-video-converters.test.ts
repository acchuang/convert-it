import { describe, it, expect } from 'vitest';
import { getTargetFormats } from '@/lib/converters';
import { convertAudioVideo, extractAudio } from '@/lib/audio-video-converters';

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
      /NEXT_PUBLIC_FFMPEG_BASE_URL is not set/
    );
  });

  it('extractAudio rejects too', async () => {
    await expect(extractAudio(file, 'mp3')).rejects.toThrow(/FFmpeg/);
  });
});
