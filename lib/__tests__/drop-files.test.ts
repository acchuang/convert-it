import { describe, expect, it } from 'vitest';
import { filesFromDrop, filesFromInput } from '@/lib/drop-files';
import { applyNameTemplate } from '@/lib/filenames';

// Minimal FileSystemEntry fakes: a directory hands out its children in
// batches of at most 100, as Chrome's readEntries does.
type Fake = { name: string; children?: Fake[] };
function entry(node: Fake): FileSystemEntry {
  if (!node.children) {
    return {
      name: node.name,
      isFile: true,
      isDirectory: false,
      file: (ok: (f: File) => void) => ok(new File(['x'], node.name)),
    } as unknown as FileSystemEntry;
  }
  return {
    name: node.name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void) => {
          const batch = node.children!.slice(at, at + 100).map(entry);
          at += 100;
          ok(batch);
        },
      };
    },
  } as unknown as FileSystemEntry;
}
const drop = (...roots: Fake[]) =>
  ({
    items: roots.map((r) => ({ kind: 'file', webkitGetAsEntry: () => entry(r) })),
    files: [],
  }) as unknown as DataTransfer;

describe('filesFromDrop', () => {
  it('expands folders recursively, keeping each file’s folder', async () => {
    const got = await filesFromDrop(
      drop(
        { name: 'top.png' },
        {
          name: 'Trip',
          children: [
            { name: 'a.heic' },
            { name: '.DS_Store' },
            { name: 'Day 2', children: [{ name: 'b.heic' }, { name: 'Thumbs.db' }] },
          ],
        },
      ),
    );
    expect(got.map((p) => `${p.folder}|${p.file.name}`)).toEqual([
      '|top.png',
      'Trip|a.heic',
      'Trip/Day 2|b.heic',
    ]);
  });

  it('reads past the first 100 entries of a folder', async () => {
    const children = Array.from({ length: 250 }, (_, i) => ({ name: `f${i}.png` }));
    const got = await filesFromDrop(drop({ name: 'Big', children }));
    expect(got).toHaveLength(250);
  });

  it('falls back to plain files without the entry API', async () => {
    const dt = { items: [], files: [new File(['x'], 'a.png'), new File(['y'], '.hidden')] };
    const got = await filesFromDrop(dt as unknown as DataTransfer);
    expect(got.map((p) => p.file.name)).toEqual(['a.png']);
  });
});

describe('filesFromInput', () => {
  const picked = (path: string) => {
    const f = new File(['x'], path.split('/').pop()!);
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };

  it('takes the folder from webkitRelativePath and skips junk anywhere in the path', () => {
    const got = filesFromInput([
      picked('Album/x.jpg'),
      picked('Album/.git/config'),
      picked('Album/Sub/y.jpg'),
      new File(['z'], 'plain.png'),
    ]);
    expect(got.map((p) => `${p.folder}|${p.file.name}`)).toEqual([
      'Album|x.jpg',
      'Album/Sub|y.jpg',
      '|plain.png',
    ]);
  });
});

describe('applyNameTemplate', () => {
  const base = { name: 'IMG_0001', ext: 'webp', source: 'heic', n: 3, total: 120 };

  it('the default keeps today’s naming', () => {
    expect(applyNameTemplate('{name}.{ext}', base)).toBe('IMG_0001.webp');
    expect(applyNameTemplate('', base)).toBe('IMG_0001.webp');
  });

  it('fills every placeholder, padding {n} to the list length', () => {
    expect(
      applyNameTemplate('{n}-{name}-{w}x{h}-from-{source}-{date}.{ext}', {
        ...base,
        width: 800,
        height: 600,
        date: new Date('2026-09-24T12:00:00Z'),
      }),
    ).toBe('003-IMG_0001-800x600-from-heic-2026-09-24.webp');
  });

  it('an unknown size drops {w}x{h} with its separator', () => {
    expect(applyNameTemplate('{name}-{w}x{h}.{ext}', base)).toBe('IMG_0001.webp');
  });

  it('adds the extension when the template leaves it off', () => {
    expect(applyNameTemplate('{name}-small', base)).toBe('IMG_0001-small.webp');
  });

  it('no path tricks or illegal characters get through', () => {
    expect(applyNameTemplate('../{name}:x?.{ext}', base)).toBe('.._IMG_0001_x_.webp');
    expect(applyNameTemplate('{name}/evil', base)).toBe('IMG_0001_evil.webp');
  });
});
