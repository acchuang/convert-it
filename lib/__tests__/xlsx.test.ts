import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { readWorkbook, sheetToObjects, writeWorkbook, cellToText } from '@/lib/xlsx';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name));

// sheetjs-*.xlsx were written by SheetJS 0.18.5 (the library this replaces), so
// they pin the reader against a real third-party producer.
describe('readWorkbook on a SheetJS-written file', () => {
  it('reads every sheet, in order, with names', async () => {
    const sheets = await readWorkbook(fixture('sheetjs-types.xlsx'));
    expect(sheets.map((s) => s.name)).toEqual(['People', 'Other']);
    expect(sheets[1].rows).toEqual([['second', 'sheet']]);
  });

  it('decodes shared strings, numbers, booleans, dates, formula results and errors', async () => {
    const [sheet] = await readWorkbook(fixture('sheetjs-types.xlsx'));
    expect(sheet.rows[0]).toEqual(['name', 'age', 'joined', 'active', 'note', 'ratio', 'sum']);
    expect(sheet.rows[1]).toEqual([
      'Alice',
      30,
      new Date(Date.UTC(2024, 0, 15)),
      true,
      '  padded & <tagged>',
      0.3,
      55,
    ]);
    expect(sheet.rows[2]).toEqual([
      'Bob',
      25,
      new Date(Date.UTC(2023, 11, 31, 13, 45, 0)),
      false,
      '007',
      1e21,
      'Alice!',
    ]);
    expect(sheet.rows[3]).toEqual(['名前', null, null, null, 'multi\nline', -3.5, '#DIV/0!']);
  });

  // SheetJS 0.18.5 sets date1904 but still writes the 1900-system serial, which
  // Excel shows four years off; the fixture's cell was corrected by hand to the
  // real 1904 serial for 2024-01-15 (45306 − 1462).
  it('honours the 1904 date system', async () => {
    const [sheet] = await readWorkbook(fixture('sheetjs-1904.xlsx'));
    expect(sheet.rows[1][0]).toEqual(new Date(Date.UTC(2024, 0, 15)));
  });
});

describe('readWorkbook edge cases', () => {
  async function workbookWith(sheetXml: string, sharedXml?: string): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships>' +
        '<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>' +
        (sharedXml ? '<Relationship Id="rId2" Type="x/sharedStrings" Target="/xl/sst.xml"/>' : '') +
        '</Relationships>',
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`,
    );
    if (sharedXml) zip.file('xl/sst.xml', `<sst>${sharedXml}</sst>`);
    return zip.generateAsync({ type: 'uint8array' });
  }

  it('joins rich-text runs and reads inline strings', async () => {
    const data = await workbookWith(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>inline</t></is></c></row>',
      '<si><r><t>bold</t></r><r><t xml:space="preserve"> plain</t></r><rPh><t>ignored</t></rPh></si>',
    );
    const [sheet] = await readWorkbook(data);
    expect(sheet.rows).toEqual([['bold plain', 'inline']]);
  });

  it('places sparse cells by reference and pads rows to a rectangle', async () => {
    const data = await workbookWith(
      '<row r="2"><c r="C2"><v>1</v></c></row><row r="4"><c r="A4" t="str"><v>x</v></c></row>',
    );
    const [sheet] = await readWorkbook(data);
    expect(sheet.rows).toEqual([
      [null, null, null],
      [null, null, 1],
      [null, null, null],
      ['x', null, null],
    ]);
  });

  it('keeps numeric-looking text as text', async () => {
    const data = await workbookWith('<row r="1"><c r="A1" t="str"><v>00123</v></c></row>');
    expect((await readWorkbook(data))[0].rows).toEqual([['00123']]);
  });

  it('rejects non-zip input with a readable message', async () => {
    await expect(readWorkbook(new TextEncoder().encode('not a zip'))).rejects.toThrow(/not a zip/);
  });

  it('is not tricked into prototype pollution by hostile keys', async () => {
    const data = await workbookWith(
      '<row r="1"><c r="A1" t="str"><v>__proto__</v></c></row><row r="2"><c r="A2" t="str"><v>polluted</v></c></row>',
    );
    const objects = sheetToObjects((await readWorkbook(data))[0]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(objects).toHaveLength(1);
  });
});

describe('sheetToObjects', () => {
  it('skips empty cells and rows, names blank and repeated headers', () => {
    const objects = sheetToObjects({
      name: 'S',
      rows: [
        ['a', null, 'a'],
        [1, 2, 3],
        [null, null, null],
        [null, 'x', null],
      ],
    });
    expect(objects).toEqual([{ a: 1, __EMPTY: 2, a_1: 3 }, { __EMPTY: 'x' }]);
  });
});

describe('cellToText', () => {
  it('formats dates, times and booleans the way a spreadsheet user reads them', () => {
    expect(cellToText(new Date(Date.UTC(2024, 0, 15)))).toBe('2024-01-15');
    expect(cellToText(new Date(Date.UTC(2024, 0, 15, 9, 5, 7)))).toBe('2024-01-15 09:05:07');
    expect(cellToText(true)).toBe('TRUE');
    expect(cellToText(null)).toBe('');
  });
});

describe('writeWorkbook', () => {
  it('round-trips values through its own reader', async () => {
    const rows = [
      ['text', 'num', 'bool', 'obj'],
      ['a & <b>', 1.5, true, { k: [1] }],
      ['', -2, false, null],
    ];
    const blob = await writeWorkbook(rows, 'My: Sheet?');
    const sheets = await readWorkbook(await blob.arrayBuffer());
    expect(sheets[0].name).toBe('My_ Sheet_');
    expect(sheets[0].rows).toEqual([
      ['text', 'num', 'bool', 'obj'],
      ['a & <b>', 1.5, true, '{"k":[1]}'],
      [null, -2, false, null],
    ]);
  });

  it('strips XML-illegal control characters that make Excel reject the file', async () => {
    const blob = await writeWorkbook([['bad\u0001\u000Bchar\ttab']]);
    const [sheet] = await readWorkbook(await blob.arrayBuffer());
    expect(sheet.rows).toEqual([['badchar\ttab']]);
  });

  it('writes column letters past Z', async () => {
    const row = Array.from({ length: 30 }, (_, i) => i);
    const blob = await writeWorkbook([row]);
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer()))
      .file('xl/worksheets/sheet1.xml')!
      .async('string');
    expect(xml).toContain('r="AD1"');
    expect((await readWorkbook(await blob.arrayBuffer()))[0].rows[0]).toEqual(row);
  });
});
