import { describe, expect, it } from 'vitest';
import { filesFromClipboard, pastedTextKind } from '@/lib/paste';

function clipboard(data: Record<string, string>, files: File[] = []): DataTransfer {
  return {
    files: files as unknown as FileList,
    getData: (type: string) => data[type] ?? '',
  } as DataTransfer;
}

describe('pastedTextKind', () => {
  it('a spreadsheet range is TSV', () => {
    expect(pastedTextKind('name\tage\nAda\t36\nAlan\t41\n', '<table>…</table>')).toBe('tsv');
  });

  it('ragged tabs are not a table', () => {
    expect(pastedTextKind('a\tb\nc\n', '')).toBe('txt');
    expect(pastedTextKind('one\tline', '')).toBe('txt');
  });

  it('JSON only if it parses', () => {
    expect(pastedTextKind('{"a": [1, 2]}', '')).toBe('json');
    expect(pastedTextKind('{not json', '')).toBe('txt');
  });

  it('rich text from a page is HTML; plain text stays text', () => {
    expect(pastedTextKind('Hello', '<p><b>Hello</b></p>')).toBe('html');
    expect(pastedTextKind('Hello', '')).toBe('txt');
  });
});

describe('filesFromClipboard', () => {
  it('files (a screenshot) come through as they are', () => {
    const shot = new File(['png'], 'image.png', { type: 'image/png' });
    expect(filesFromClipboard(clipboard({ 'text/plain': 'ignored' }, [shot]))).toEqual([shot]);
  });

  it('text becomes one named file, HTML keeping its markup', async () => {
    const [tsv] = filesFromClipboard(clipboard({ 'text/plain': 'a\tb\n1\t2' }));
    expect([tsv.name, tsv.type, await tsv.text()]).toEqual([
      'pasted.tsv',
      'text/tab-separated-values',
      'a\tb\n1\t2',
    ]);
    const [html] = filesFromClipboard(
      clipboard({ 'text/plain': 'Hi', 'text/html': '<h1>Hi</h1>' }),
    );
    expect([html.name, await html.text()]).toEqual(['pasted.html', '<h1>Hi</h1>']);
  });

  it('nothing usable, nothing added', () => {
    expect(filesFromClipboard(clipboard({ 'text/plain': '  \n' }))).toEqual([]);
    expect(filesFromClipboard(null)).toEqual([]);
  });
});
