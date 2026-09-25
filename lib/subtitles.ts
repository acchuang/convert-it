// Subtitles: SubRip (.srt) and WebVTT (.vtt), read leniently, written strictly.
//
// Real-world SRT is messy: a byte-order mark, CRLF or CR line ends, missing
// or wrong cue numbers, "." instead of "," before the milliseconds, hours
// left off, stray blank lines, <font> tags. The reader accepts all of that.
// The writers emit what each format's spec says: numbered cues with
// HH:MM:SS,mmm for SRT, a WEBVTT header and HH:MM:SS.mmm for VTT.

import type { ConversionSettings } from './types';
import { ConversionError } from './errors';

export interface Cue {
  start: number; // seconds
  end: number;
  text: string; // lines joined with \n; only <b>, <i>, <u> markup kept
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;
const TIMING = new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

/** Keeps b/i/u; drops every other tag (VTT voice/class spans, SRT <font>, karaoke timestamps). */
function cleanText(text: string): string {
  return text
    .replace(/<v(?:\.[^\s>]+)*\s+([^>]+)>/g, '$1: ') // <v Speaker> → "Speaker: "
    .replace(
      /<(\/?)([biu])(?:\.[^>]*)?>/gi,
      (_, slash, tag) => `\u0000${slash}${tag.toLowerCase()}\u0001`,
    )
    .replace(/<[^>]*>/g, '')
    .replace(/\u0000/g, '<')
    .replace(/\u0001/g, '>')
    .replace(/\{\\[^}]*\}/g, '') // ASS-style overrides some SRTs carry: {\an8}
    .trim();
}

/** Cues from SRT or VTT text; which one it is doesn't matter. */
export function parseSubtitles(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  // Blocks are separated by blank lines; a block without a timing line
  // (WEBVTT header, NOTE, STYLE, REGION, junk) is skipped.
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at === -1) continue;
    const m = lines[at].match(TIMING)!;
    const start = seconds(m[1], m[2], m[3], m[4]);
    const end = seconds(m[5], m[6], m[7], m[8]);
    const body = cleanText(lines.slice(at + 1).join('\n'));
    if (!body) continue;
    cues.push({ start, end: Math.max(end, start), text: body });
  }
  return cues;
}

function stamp(t: number, separator: ',' | '.'): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(cues: Cue[]): string {
  // "-->" can't appear in VTT cue text, and a blank line would end the cue.
  const safe = (text: string) => text.replace(/-->/g, '→').replace(/\n\s*\n/g, '\n');
  return `WEBVTT\n\n${cues
    .map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${safe(c.text)}\n`)
    .join('\n')}`;
}

/** The words only, one cue per line: a transcript. */
export function toTranscript(cues: Cue[]): string {
  return cues.map((c) => c.text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ')).join('\n') + '\n';
}

/** Moves every cue by `offset` seconds; cues pushed before 0 are clipped or dropped. */
export function shift(cues: Cue[], offset: number): Cue[] {
  if (!offset) return cues;
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start + offset), end: c.end + offset }))
    .filter((c) => c.end > 0);
}

async function read(file: File): Promise<Cue[]> {
  const cues = parseSubtitles(await file.text());
  if (!cues.length) {
    throw new ConversionError(
      'corrupt-input',
      'No subtitle cues found (expected lines like 00:00:01,000 --> 00:00:04,000)',
    );
  }
  return cues;
}

export async function subtitlesTo(
  file: File,
  _sourceExt: string,
  targetExt: string,
  settings?: ConversionSettings,
): Promise<Blob> {
  const cues = await read(file);
  if (targetExt === 'txt') {
    return new Blob([toTranscript(cues)], { type: 'text/plain;charset=utf-8' });
  }
  const timed = shift(cues, settings?.subtitleOffset ?? 0);
  return targetExt === 'vtt'
    ? new Blob([toVtt(timed)], { type: 'text/vtt;charset=utf-8' })
    : new Blob([toSrt(timed)], { type: 'application/x-subrip;charset=utf-8' });
}

/**
 * Advanced SubStation Alpha, for burning subtitles in with libass. Without
 * fontconfig libass never falls back to another font for a missing glyph, so
 * each run of text names its font: Noto Sans for Latin, Greek and Cyrillic,
 * Noto Sans SC for CJK and kana, Noto Sans KR for Hangul (`fontFor`).
 * <b>/<i>/<u> become ASS override tags; literal braces become parentheses,
 * since ASS reads braces as tags.
 */
export function toAss(
  cues: Cue[],
  fontFor: (cp: number) => string,
  baseFont = 'Noto Sans',
): string {
  const time = (t: number) => {
    const cs = Math.max(0, Math.round(t * 100));
    const h = Math.floor(cs / 360000);
    const m = Math.floor((cs % 360000) / 6000);
    const s = Math.floor((cs % 6000) / 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  };
  const TAG = { b: 'b', i: 'i', u: 'u' } as const;
  const line = (text: string) => {
    let out = '';
    let font = baseFont;
    // Split into markup tags and characters; switch font only on visible text.
    for (const part of text
      .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
      .split(/(<\/?[biu]>)/)) {
      const tag = part.match(/^<(\/?)([biu])>$/);
      if (tag) {
        out += `{\\${TAG[tag[2] as keyof typeof TAG]}${tag[1] ? 0 : 1}}`;
        continue;
      }
      for (const ch of part) {
        if (ch === '\n') {
          out += '\\N';
          continue;
        }
        // Spaces too: the CJK and Hangul subsets have no space glyph.
        const wanted = fontFor(ch.codePointAt(0)!);
        if (wanted !== font) {
          out += `{\\fn${wanted}}`;
          font = wanted;
        }
        out += ch === '\\' ? '\\​' : ch;
      }
    }
    return out;
  };
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 384',
    'PlayResY: 288',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${baseFont},18,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1.2,0,2,16,16,14,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.map(
      (c) => `Dialogue: 0,${time(c.start)},${time(c.end)},Default,,0,0,0,,${line(c.text)}`,
    ),
    '',
  ].join('\n');
}
