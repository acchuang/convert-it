import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Papa from 'papaparse';
import { JsonArrayWriter } from '@/lib/csv-stream';
import { csvToJson, csvToTsv, tsvToCsv, tsvToJson } from '@/lib/csv-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

// Small chunks, so rows straddle hundreds of chunk boundaries (in production a
// chunk is 10 MB, which a test file would never reach).
const defaultChunk = Papa.LocalChunkSize;
beforeAll(() => {
  Papa.LocalChunkSize = 64 * 1024;
});
afterAll(() => {
  Papa.LocalChunkSize = defaultChunk;
});

function hostileCsv(rows: number, delimiter = ','): string {
  const header = ['id', 'name', 'note', 'price', 'flag'].join(delimiter);
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const note =
      i % 7 === 0
        ? `"has ${delimiter} delimiter, ""quotes"" and\na newline"`
        : i % 5 === 0
          ? 'ünïcödé — 中文 — 😀'
          : `plain ${i}`;
    lines.push(
      [
        String(i).padStart(5, '0'),
        `name${i}`,
        note,
        (i * 1.25).toFixed(2),
        i % 2 ? 'true' : 'false',
      ].join(delimiter),
    );
    if (i % 1000 === 0) lines.push(''); // empty lines are skipped
  }
  return lines.join('\n');
}

describe('streaming CSV/TSV → JSON', () => {
  const csv = hostileCsv(40_000);

  it('matches JSON.stringify of a whole-file parse byte for byte, at every indent', async () => {
    const expectedRows = Papa.parse(csv, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data;
    for (const indent of [0, 2, 4]) {
      const blob = await csvToJson(new File([csv], 'a.csv'), 'csv', 'json', {
        ...DEFAULT_SETTINGS,
        jsonIndent: indent,
      });
      const expected =
        indent === 0 ? JSON.stringify(expectedRows) : JSON.stringify(expectedRows, null, indent);
      expect(await blob.text()).toBe(expected);
    }
  });

  it('reports rising progress through the file, never 100 before the end', async () => {
    const seen: number[] = [];
    await csvToJson(new File([csv], 'a.csv'), 'csv', 'json', DEFAULT_SETTINGS, (pct) =>
      seen.push(pct),
    );
    expect(seen.length).toBeGreaterThan(10);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(Math.max(...seen)).toBeLessThanOrEqual(99);
  });

  it('TSV → JSON matches too', async () => {
    const tsv = hostileCsv(5_000, '\t');
    const expected = Papa.parse(tsv, {
      header: true,
      delimiter: '\t',
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data;
    const blob = await tsvToJson(new File([tsv], 'a.tsv'), 'tsv', 'json', DEFAULT_SETTINGS);
    expect(await blob.text()).toBe(JSON.stringify(expected, null, 2));
  });

  it('decodes a multi-byte character split across a chunk boundary', async () => {
    // Put a 4-byte emoji exactly across the 64 KB slice boundary.
    const prefix = 'a,b\nx,';
    const filler = 'y'.repeat(64 * 1024 - new TextEncoder().encode(prefix).length - 2);
    const csv = `${prefix}${filler}😀z\n`;
    const blob = await csvToJson(new File([csv], 'a.csv'), 'csv', 'json', {
      ...DEFAULT_SETTINGS,
      jsonIndent: 0,
    });
    expect(JSON.parse(await blob.text())).toEqual([{ a: 'x', b: `${filler}😀z` }]);
  });

  it('writes [] for an empty file', async () => {
    const blob = await csvToJson(new File([''], 'a.csv'), 'csv', 'json', DEFAULT_SETTINGS);
    expect(await blob.text()).toBe('[]');
  });

  it('writes [] for a header-only file', async () => {
    const blob = await csvToJson(new File(['a,b\n'], 'a.csv'), 'csv', 'json', DEFAULT_SETTINGS);
    expect(await blob.text()).toBe('[]');
  });
});

describe('CSV ⇄ TSV', () => {
  it('quotes cells containing tabs, quotes or newlines, and round-trips', async () => {
    const csv = 'a,b\n"tab\there","line\nbreak"\n"say ""hi""",plain';
    const tsv = await (await csvToTsv(new File([csv], 'a.csv'), 'csv', 'tsv')).text();
    expect(tsv).toBe('a\tb\n"tab\there"\t"line\nbreak"\n"say ""hi"""\tplain');
    const back = await (
      await tsvToCsv(new File([tsv], 'a.tsv'), 'tsv', 'csv', DEFAULT_SETTINGS)
    ).text();
    expect(Papa.parse(back).data).toEqual(Papa.parse(csv).data);
  });

  it('streams large files without losing rows', async () => {
    const csv = hostileCsv(20_000);
    const tsv = await (await csvToTsv(new File([csv], 'a.csv'), 'csv', 'tsv')).text();
    const rows = Papa.parse(tsv, { delimiter: '\t', skipEmptyLines: true }).data;
    expect(rows).toEqual(Papa.parse(csv, { skipEmptyLines: true }).data);
  });
});

describe('JsonArrayWriter', () => {
  it('is identical to JSON.stringify for nested and empty values', async () => {
    const values = [{ a: [1, { b: null }], c: 'x\ny' }, [], {}, 'str', 3.5, null, [[]]];
    for (const indent of [0, 1, 2, 4]) {
      const writer = new JsonArrayWriter(indent);
      values.forEach((v) => writer.push(v));
      expect(await writer.toBlob().text()).toBe(JSON.stringify(values, null, indent || undefined));
    }
  });
});
