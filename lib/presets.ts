// One-click presets over the raw knobs. Each is just a settings patch; the
// knobs stay available under "Advanced", and whatever they're set to, the
// preset that matches (if any) shows as selected.

import type { ConversionSettings } from './types';

export interface Preset {
  id: string;
  patch: Partial<ConversionSettings>;
}

export const VIDEO_PRESETS: Preset[] = [
  { id: 'smallest', patch: { videoQuality: 32, videoPreset: 'medium' } },
  { id: 'balanced', patch: { videoQuality: 23, videoPreset: 'medium' } },
  { id: 'best', patch: { videoQuality: 18, videoPreset: 'slow' } },
  // CRF 0 is lossless in x264 only; libvpx and the fixed-quantiser codecs
  // just get their best quality, so it isn't offered there.
  { id: 'lossless', patch: { videoQuality: 0, videoPreset: 'medium' } },
];

/** Targets where "lossless" is real (x264). */
export const LOSSLESS_VIDEO_TARGETS = new Set(['mp4', 'mov', 'mkv']);

export const IMAGE_PRESETS: Preset[] = [
  {
    id: 'full',
    patch: {
      quality: 0.92,
      imageMaxSide: 0,
      imageResizePercent: 100,
      imageResizeWidth: 0,
      imageResizeHeight: 0,
    },
  },
  {
    id: 'web',
    patch: {
      quality: 0.82,
      imageMaxSide: 2048,
      imageResizePercent: 100,
      imageResizeWidth: 0,
      imageResizeHeight: 0,
    },
  },
  {
    id: 'email',
    patch: {
      quality: 0.75,
      imageMaxSide: 1280,
      imageResizePercent: 100,
      imageResizeWidth: 0,
      imageResizeHeight: 0,
    },
  },
];

/** The preset these settings match exactly, or null ("custom"). */
export function activePreset(
  presets: Preset[],
  settings: Partial<ConversionSettings>,
): string | null {
  const match = presets.find((p) =>
    Object.entries(p.patch).every(
      ([key, value]) => settings[key as keyof ConversionSettings] === value,
    ),
  );
  return match?.id ?? null;
}
