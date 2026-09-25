// Files from a drop or a picker, folders included. A dropped folder used to
// arrive as one zero-byte "file" that failed to convert; now every file in
// it is added (recursively), with the folder it came from, so "Download all"
// can rebuild the same structure in the zip.

export interface PickedFile {
  file: File;
  /** Folder path relative to what was dropped/picked, '' at the top level. */
  folder: string;
}

// Finder and Explorer litter folders with these; nobody means to convert them.
const JUNK = /^(\.|Thumbs\.db$|desktop\.ini$)/i;

const keep = (name: string) => !JUNK.test(name);

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns at most 100 entries per call (Chrome): call until empty.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, folder: string, out: PickedFile[]): Promise<void> {
  if (!keep(entry.name)) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, folder });
    return;
  }
  if (entry.isDirectory) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walk(child, path, out);
  }
}

/**
 * Everything dropped, folders expanded. The entries are taken synchronously:
 * a DataTransfer's items are gone once the drop event handler returns, so
 * this must be called from inside it (the returned promise may settle later).
 */
export function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  if (!entries.length || entries.some((e) => !e)) {
    // No entry API: plain files only.
    return Promise.resolve(
      Array.from(dt.files)
        .filter((f) => keep(f.name))
        .map((file) => ({ file, folder: '' })),
    );
  }
  return (async () => {
    const out: PickedFile[] = [];
    for (const entry of entries) await walk(entry!, '', out);
    return out;
  })();
}

/** From an <input type="file">, with or without webkitdirectory. */
export function filesFromInput(list: FileList | File[]): PickedFile[] {
  // webkitRelativePath is "" for a plain pick ("folder/sub/a.png" from a
  // folder pick); jsdom leaves it undefined.
  const parts = (file: File) => (file.webkitRelativePath || file.name).split('/');
  return Array.from(list)
    .filter((file) => parts(file).every(keep))
    .map((file) => ({ file, folder: parts(file).slice(0, -1).join('/') }));
}
