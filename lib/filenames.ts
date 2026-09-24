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
