// Filename helpers shared by the job manager (zip downloads) and converters that
// emit zips. Kept free of React so the conversion worker can import it.

/**
 * Keeps zip entries from overwriting each other: `photo.jpg` and `photo.png`
 * both converted to PNG, or two `IMG_0001.HEIC` from different folders, used to
 * leave one file in the archive. Later ones become `photo (2).png`, and so on.
 */
export function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// Characters Windows, macOS or common unzip tools reject in a file name.
const UNSAFE = /[\u0000-\u001f<>:"/\\|?*]/g;

/** A user-supplied label (sheet name, page title) as a safe file-name stem. */
export function safeFileStem(label: string, fallback = 'untitled'): string {
  const stem = label
    .replace(UNSAFE, '_')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 100);
  return stem || fallback;
}

export const DEFAULT_NAME_TEMPLATE = '{name}.{ext}';

export interface NameParts {
  /** The source file name without its extension. */
  name: string;
  /** The output extension. */
  ext: string;
  /** The source extension. */
  source: string;
  /** 1-based position in the list, and the list's length (for padding). */
  n: number;
  total: number;
  /** Output image size, when known. */
  width?: number;
  height?: number;
  date?: Date;
}

/**
 * An output name from a template such as "{name}-{w}x{h}.{ext}".
 * Placeholders: {name} {ext} {source} {n} (zero-padded to the list length)
 * {date} (YYYY-MM-DD) {w} {h}. An unknown size leaves {w}x{h} out along with
 * the separator before it. The extension is added if the template left it
 * off, and characters no file system accepts become "_".
 */
export function applyNameTemplate(template: string, parts: NameParts): string {
  const size = parts.width && parts.height;
  const date = (parts.date ?? new Date()).toISOString().slice(0, 10);
  let out = (template.trim() || DEFAULT_NAME_TEMPLATE)
    .replace(/[-_ ]?\{w\}x\{h\}/g, (m) =>
      size ? m.replace('{w}x{h}', `${parts.width}x${parts.height}`) : '',
    )
    .replace(/\{name\}/g, parts.name)
    .replace(/\{ext\}/g, parts.ext)
    .replace(/\{source\}/g, parts.source)
    .replace(/\{n\}/g, String(parts.n).padStart(String(parts.total).length, '0'))
    .replace(/\{date\}/g, date)
    .replace(/\{w\}/g, size ? String(parts.width) : '')
    .replace(/\{h\}/g, size ? String(parts.height) : '');
  if (!out.toLowerCase().endsWith(`.${parts.ext.toLowerCase()}`)) out += `.${parts.ext}`;
  const dot = out.lastIndexOf('.');
  const stem = safeFileStem(out.slice(0, dot), parts.name);
  return `${stem}.${parts.ext}`;
}
