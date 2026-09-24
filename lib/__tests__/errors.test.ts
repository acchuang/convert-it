import { describe, it, expect } from 'vitest';
import { classifyError, ConversionError } from '@/lib/errors';
import { convertFile } from '@/lib/converters';
import { xmlToCsv } from '@/lib/xml-converters';
import { readWorkbook } from '@/lib/xlsx';
import { jsonToCsv } from '@/lib/csv-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

async function failureOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return classifyError(err);
  }
  throw new Error('expected a rejection');
}

// Real errors from the converters, not hand-written strings: if a converter's
// message changes, these tests say so.
describe('classifyError on what the converters actually throw', () => {
  it('malformed XML is corrupt input', async () => {
    const f = await failureOf(
      xmlToCsv(new File(['<a><b></a>'], 'x.xml'), 'xml', 'csv', DEFAULT_SETTINGS),
    );
    expect(f.code).toBe('corrupt-input');
    expect(f.detail).toMatch(/Invalid XML/);
  });

  it('a non-zip .xlsx is corrupt input', async () => {
    const f = await failureOf(readWorkbook(new TextEncoder().encode('not a zip')));
    expect(f.code).toBe('corrupt-input');
  });

  it('bad JSON is corrupt input (SyntaxError)', async () => {
    const f = await failureOf(
      jsonToCsv(new File(['{oops'], 'a.json'), 'json', 'csv', DEFAULT_SETTINGS),
    );
    expect(f.code).toBe('corrupt-input');
    expect(f.detail).toMatch(/^SyntaxError: /);
  });

  it('undecodable image bytes are corrupt input', async () => {
    const f = await failureOf(
      convertFile(new File([new Uint8Array([1, 2, 3])], 'a.png'), 'jpg', DEFAULT_SETTINGS),
    );
    expect(f.code).toBe('corrupt-input');
  });

  it('an unregistered pair is unsupported', async () => {
    const f = await failureOf(convertFile(new File(['x'], 'a.txt'), 'xlsx', DEFAULT_SETTINGS));
    expect(f.code).toBe('unsupported');
  });
});

describe('classifyError on engine and platform messages', () => {
  it.each([
    ['RuntimeError: memory access out of bounds', 'out-of-memory'],
    ['Conversion worker crashed — the file may be too large', 'out-of-memory'],
    ['Spreadsheet is too large to convert in the browser', 'out-of-memory'],
    ['Failed to load FFmpeg: Failed to fetch', 'engine-load'],
    [
      'Failed to load FFmpeg: ffmpeg-core.js failed its integrity check — refusing to run it',
      'engine-load',
    ],
    ['Font noto-sans-cjk-regular.ttf: HTTP 404', 'engine-load'],
    ['TypeError: Load failed', 'engine-load'], // Safari's fetch failure
    [
      'FFmpeg could not convert this file (exit 1): input.mp4: Invalid data found when processing input',
      'corrupt-input',
    ],
    ['FFmpeg could not convert this file (exit 1): moov atom not found', 'corrupt-input'],
    ['something nobody anticipated', 'unknown'],
  ])('%s → %s', (message, code) => {
    expect(classifyError(new Error(message)).code).toBe(code);
  });

  it('trusts an explicit ConversionError and keeps its params', () => {
    const f = classifyError(new ConversionError('too-large', 'big', { size: 9, limit: 5 }));
    expect(f).toEqual({ code: 'too-large', detail: 'big', params: { size: 9, limit: 5 } });
  });

  it('treats allocation RangeErrors as out of memory, other RangeErrors as unknown', () => {
    expect(classifyError(new RangeError('Array buffer allocation failed')).code).toBe(
      'out-of-memory',
    );
    expect(classifyError(new RangeError('Invalid time value')).code).toBe('unknown');
  });

  it('handles non-Error throwables', () => {
    expect(classifyError('plain string')).toEqual({ code: 'unknown', detail: 'plain string' });
  });
});
