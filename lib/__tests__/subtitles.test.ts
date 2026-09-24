import { describe, expect, it } from 'vitest';
import {
  parseSubtitles,
  shift,
  subtitlesTo,
  toAss,
  toSrt,
  toTranscript,
  toVtt,
} from '@/lib/subtitles';
import { DEFAULT_SETTINGS } from '@/lib/types';

// The kind of SRT that actually circulates: BOM, CRLF, a missing cue number,
// "." before the milliseconds, hours left off, stray blank lines, <font>
// tags and an ASS override.
const MESSY_SRT =
  '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<font color="#ffff00">Hello</font> <i>there</i>\r\n\r\n\r\n' +
  '00:00:04.2 --> 00:00:06,000\r\n{\\an8}Second line\r\nwraps here\r\n\r\n' +
  '3\r\n01:02.500 --> 01:04.000\r\nThird\r\n';

const VTT = `WEBVTT - Title

NOTE this is a comment
spanning lines

STYLE
::cue { color: yellow }

intro
00:00:01.000 --> 00:00:02.000 position:10% align:start
<v Anna>Hi, <b>Ben</b></v>

00:02.500 --> 00:04.000
<c.loud>Karaoke</c> <00:00:03.000>time
`;

describe('parseSubtitles', () => {
  it('reads messy SRT', () => {
    expect(parseSubtitles(MESSY_SRT)).toEqual([
      { start: 1, end: 3.5, text: 'Hello <i>there</i>' },
      { start: 4.2, end: 6, text: 'Second line\nwraps here' },
      { start: 62.5, end: 64, text: 'Third' },
    ]);
  });

  it('reads VTT, skipping header, NOTE and STYLE blocks, cue ids and settings', () => {
    expect(parseSubtitles(VTT)).toEqual([
      { start: 1, end: 2, text: 'Anna: Hi, <b>Ben</b>' },
      { start: 2.5, end: 4, text: 'Karaoke time' },
    ]);
  });

  it('nothing that looks like a cue is nothing', () => {
    expect(parseSubtitles('just some text\n\nand more')).toEqual([]);
  });
});

describe('writers', () => {
  const cues = parseSubtitles(MESSY_SRT);

  it('SRT: numbered cues, HH:MM:SS,mmm', () => {
    expect(toSrt(cues)).toBe(
      '1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\n\n' +
        '2\n00:00:04,200 --> 00:00:06,000\nSecond line\nwraps here\n\n' +
        '3\n00:01:02,500 --> 00:01:04,000\nThird\n',
    );
  });

  it('VTT: header, HH:MM:SS.mmm, no "-->" or blank lines inside a cue', () => {
    const vtt = toVtt([{ start: 0, end: 1.25, text: 'a --> b\n\nc' }]);
    expect(vtt).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.250\na → b\nc\n');
  });

  it('round-trips SRT → VTT → SRT without loss', () => {
    expect(parseSubtitles(toVtt(parseSubtitles(toSrt(cues))))).toEqual(cues);
  });

  it('transcript: words only, one cue per line', () => {
    expect(toTranscript(cues)).toBe('Hello there\nSecond line wraps here\nThird\n');
  });
});

describe('shift', () => {
  const cues = [
    { start: 0.5, end: 1, text: 'a' },
    { start: 2, end: 3, text: 'b' },
  ];

  it('moves every cue', () => {
    expect(shift(cues, 1.5)).toEqual([
      { start: 2, end: 2.5, text: 'a' },
      { start: 3.5, end: 4.5, text: 'b' },
    ]);
  });

  it('clips cues moved before zero, drops those entirely before it', () => {
    expect(shift(cues, -1.5)).toEqual([{ start: 0.5, end: 1.5, text: 'b' }]);
  });
});

describe('subtitlesTo', () => {
  const srt = new File([MESSY_SRT], 'movie.srt');

  it('SRT → VTT with an offset', async () => {
    const out = await subtitlesTo(srt, 'srt', 'vtt', { ...DEFAULT_SETTINGS, subtitleOffset: 2 });
    expect(out.type).toMatch(/^text\/vtt/);
    expect(await out.text()).toMatch(/^WEBVTT\n\n00:00:03\.000 --> 00:00:05\.500\n/);
  });

  it('SRT → SRT re-times and cleans up', async () => {
    const out = await subtitlesTo(srt, 'srt', 'srt', { ...DEFAULT_SETTINGS, subtitleOffset: -0.5 });
    expect(await out.text()).toMatch(/^1\n00:00:00,500 --> 00:00:03,000\nHello <i>there<\/i>\n/);
  });

  it('not subtitles → corrupt input', async () => {
    await expect(
      subtitlesTo(new File(['hello'], 'x.srt'), 'srt', 'vtt', DEFAULT_SETTINGS),
    ).rejects.toMatchObject({ code: 'corrupt-input' });
  });
});

describe('toAss (for burn-in)', () => {
  const fontFor = (cp: number) =>
    cp >= 0xac00 && cp <= 0xd7a3 ? 'KR' : cp >= 0x3040 && cp <= 0x9fff ? 'SC' : 'Latin';
  const ass = (cues: Parameters<typeof toAss>[0]) => toAss(cues, fontFor, 'Latin');

  it('names a font per script run, spaces included (the CJK subsets have no space)', () => {
    const out = ass([{ start: 1.5, end: 62.345, text: 'Hi 你好 안녕' }]);
    expect(out).toContain(
      'Dialogue: 0,0:00:01.50,0:01:02.35,Default,,0,0,0,,Hi {\\fnSC}你好{\\fnLatin} {\\fnKR}안녕',
    );
  });

  it('turns b/i/u into override tags, newlines into \\N, braces into parentheses', () => {
    const out = ass([{ start: 0, end: 1, text: '<i>a</i> {b}\n<b>c</b>' }]);
    expect(out).toContain(',,{\\i1}a{\\i0} (b)\\N{\\b1}c{\\b0}');
  });

  it('carries a complete script header and style', () => {
    const out = ass([]);
    expect(out).toMatch(/^\[Script Info\]\nScriptType: v4\.00\+/);
    expect(out).toMatch(/\nStyle: Default,Latin,18,/);
    expect(out).toContain('[Events]\nFormat: Layer, Start, End, Style');
  });
});
