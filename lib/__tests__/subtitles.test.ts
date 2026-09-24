import { describe, expect, it } from 'vitest';
import { parseSubtitles, shift, subtitlesTo, toSrt, toTranscript, toVtt } from '@/lib/subtitles';
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
