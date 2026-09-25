import { describe, expect, it } from 'vitest';
import { extensionOf, identify, needsIdentifying, renamed, sniff } from '@/lib/identify';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const file = (name: string, ...parts: (string | number[])[]) => new File([bytes(...parts)], name);

describe('sniff', () => {
  it('knows the formats we read by their magic', () => {
    const cases: [Uint8Array, string][] = [
      [bytes([0xff, 0xd8, 0xff, 0xe0]), 'jpg'],
      [bytes('\x89PNG\r\n\x1a\n'), 'png'],
      [bytes('GIF89a'), 'gif'],
      [bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'webp'],
      [bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'wav'],
      [bytes('%PDF-1.7'), 'pdf'],
      [bytes([0, 0, 0, 0x18], 'ftypheic'), 'heic'],
      [bytes([0, 0, 0, 0x18], 'ftypavif'), 'avif'],
      [bytes([0, 0, 0, 0x18], 'ftypisom'), 'mp4'],
      [bytes([0, 0, 0, 0x14], 'ftypqt  '), 'mov'],
      [bytes([0x1a, 0x45, 0xdf, 0xa3], '\x9fB\x82\x84webm'), 'webm'],
      [bytes([0x1a, 0x45, 0xdf, 0xa3], '\x9fB\x82\x88matroska'), 'mkv'],
      [bytes('ID3', [4, 0]), 'mp3'],
      [bytes('fLaC'), 'flac'],
      [bytes('OggS'), 'ogg'],
      [bytes([0xff, 0x0a]), 'jxl'],
    ];
    for (const [head, ext] of cases) expect(sniff(head), ext).toEqual({ ext });
  });

  it('names what it recognises but can’t convert', () => {
    expect(sniff(bytes('II*\0'))).toEqual({ kind: 'image', label: 'TIFF' });
    expect(sniff(bytes('PK\x03\x04'))).toEqual({ kind: 'archive', label: 'ZIP' });
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypcrx '))).toEqual({ kind: 'raw', label: 'CR3' });
    const exe = new Uint8Array(0x48);
    exe.set(bytes('MZ'));
    exe[0x3c] = 0x40;
    exe.set(bytes('PE\0\0'), 0x40);
    expect(sniff(exe)).toEqual({ kind: 'program', label: 'EXE' });
  });

  it('text that merely starts like a signature is not that format', () => {
    expect(sniff(bytes('BMW service notes, 2024'))).toBeNull();
    expect(sniff(bytes('MZ is my initials'))).toBeNull();
    expect(sniff(bytes('FLV is a video format'))).toBeNull();
  });
});

describe('identify', () => {
  it('trusts aliases', async () => {
    expect(await identify(file('photo.jfif', 'anything'))).toEqual({ ext: 'jpg', reason: 'alias' });
    expect(await identify(file('config.yml', 'a: 1'))).toEqual({ ext: 'yaml', reason: 'alias' });
  });

  it('goes by content when the name is missing or wrong', async () => {
    expect(await identify(file('scan', '%PDF-1.4'))).toEqual({ ext: 'pdf', reason: 'content' });
    expect(await identify(file('shot.tif', [0xff, 0xd8, 0xff, 0xe1]))).toEqual({
      ext: 'jpg',
      reason: 'content',
    });
  });

  it('guesses text only for unknown names, and picks the markup it sees', async () => {
    expect(await identify(file('README', '# Hello\n'))).toEqual({ ext: 'txt', reason: 'content' });
    expect(await identify(file('page.asp', '<!DOCTYPE html><p>x'))).toEqual({
      ext: 'html',
      reason: 'content',
    });
    expect(await identify(file('icon.foo', '<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({
      ext: 'svg',
      reason: 'content',
    });
    expect(await identify(file('clip.sub', '1\n00:00:01,000 --> 00:00:02,000\nHi'))).toEqual({
      ext: 'srt',
      reason: 'content',
    });
    expect(await identify(file('run.sh', '#!/bin/sh\necho hi'))).toEqual({
      kind: 'program',
      label: 'SH',
    });
  });

  it('explains the rest', async () => {
    expect(await identify(file('scan.tiff', 'II*\0'))).toEqual({ kind: 'image', label: 'TIFF' });
    expect(await identify(file('letter.doc', [0xd0, 0xcf, 0x11, 0xe0]))).toEqual({
      kind: 'word',
      label: 'DOC',
    });
    expect(await identify(file('blob', [0, 1, 2, 3, 0xfe]))).toEqual({
      kind: 'unknown',
      label: '',
    });
    expect(await identify(file('archive', 'PK\x03\x04'))).toEqual({
      kind: 'archive',
      label: 'ZIP',
    });
  });
});

describe('helpers', () => {
  it('extensionOf: none for dotfiles and bare names', () => {
    expect(extensionOf('a.b.PNG')).toBe('png');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.bashrc')).toBe('');
  });

  it('renamed keeps the stem and the bytes', async () => {
    const f = renamed(new File(['x'], 'photo.jfif'), 'jpg');
    expect(f.name).toBe('photo.jpg');
    expect(await f.text()).toBe('x');
    expect(renamed(new File(['x'], 'scan'), 'pdf').name).toBe('scan.pdf');
  });

  it('needsIdentifying only when no route reads the extension', () => {
    expect(needsIdentifying('a.png')).toBe(false);
    expect(needsIdentifying('a.jfif')).toBe(true);
    expect(needsIdentifying('README')).toBe(true);
  });
});
