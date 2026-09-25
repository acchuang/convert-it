// One colour per file category, as theme tokens (app/globals.css), so each
// theme can use a shade that is readable as text on its own backgrounds
// (WCAG AA 4.5:1; the accessibility suite checks it).
export const CATEGORY_COLORS: Record<string, string> = {
  image: 'var(--image-color)',
  document: 'var(--document-color)',
  data: 'var(--data-color)',
  video: 'var(--video-color)',
  audio: 'var(--audio-color)',
};

/** A category colour at reduced strength, for borders and tints. */
export const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;
