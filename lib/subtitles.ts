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
