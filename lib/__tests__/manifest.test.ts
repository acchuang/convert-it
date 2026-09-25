import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONVERSION_MAP, mimeFor } from '@/lib/converters';

// The OS offers the app for exactly the files it converts: "Open with" (file
// handlers) and the share sheet (share target) list every source extension
// in the registry, under its MIME type, and nothing else.

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8'));

function expected(): Record<string, string[]> {
  const byMime: Record<string, string[]> = {};
  for (const ext of Object.keys(CONVERSION_MAP).sort())
    (byMime[mimeFor(ext)] ??= []).push(`.${ext}`);
  return byMime;
}

const sorted = (accept: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(accept)
      .map(([mime, exts]) => [mime, [...exts].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

describe('manifest', () => {
  it('file_handlers accept every source format, by MIME type', () => {
    expect(manifest.file_handlers).toHaveLength(1);
    expect(sorted(manifest.file_handlers[0].accept)).toEqual(sorted(expected()));
    expect(manifest.file_handlers[0].action).toBe('/');
  });

  it('the share target takes the same files (plus text) as multipart POST', () => {
    const { share_target: share } = manifest;
    expect(share).toMatchObject({
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url' },
    });
    const accept: string[] = share.params.files[0].accept;
    const want = expected();
    expect([...accept].sort()).toEqual(
      [...new Set([...Object.keys(want), ...Object.values(want).flat()])].sort(),
    );
  });
});
