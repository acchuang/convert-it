import type { jsPDF as JsPDF } from 'jspdf';

// A small typesetter over jsPDF, used by every text-flavoured → PDF converter.
//
// jsPDF's built-in Helvetica/Courier only encode WinAnsi (Latin-1 plus a few
// symbols), so any Greek, Cyrillic, Vietnamese, Chinese, Japanese or Korean
// text came out as mojibake. Documents that fit WinAnsi still use the built-in
// fonts: nothing to fetch and the smallest files. Anything else is set in the
// Noto subsets under public/fonts/pdf/ (scripts/build-pdf-fonts.py), and each
// font is fetched only if the document uses its script. jsPDF embeds just the
// glyphs drawn, so a PDF doesn't carry the whole 5 MB CJK font.
//
// Layout: blocks (paragraph, heading, list item, code, quote, table, rule) are
// made of styled runs. Runs are split per font, then into break opportunities
// (words for alphabetic scripts, single characters for CJK) and set greedily
// to the line width.

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  link?: string;
}

/** `indent`: nesting level (a list item's continuation), 18pt per level. */
export type Block =
  | { kind: 'paragraph'; runs: Run[]; preserve?: boolean; spaceAfter?: number; indent?: number }
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'list-item'; depth: number; marker: string; runs: Run[] }
  | { kind: 'code'; text: string; indent?: number }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' }
  | { kind: 'table'; header: Run[][]; rows: Run[][][]; indent?: number };

// --- Fonts -------------------------------------------------------------------

type FontFile =
  | 'noto-sans-regular.ttf'
  | 'noto-sans-bold.ttf'
  | 'noto-sans-mono-regular.ttf'
  | 'noto-sans-cjk-regular.ttf'
  | 'noto-sans-hangul-regular.ttf';

const FONT_BASE = '/fonts/pdf';

const POSTSCRIPT: Record<FontFile, string> = {
  'noto-sans-regular.ttf': 'NotoSans-Regular',
  'noto-sans-bold.ttf': 'NotoSans-Bold',
  'noto-sans-mono-regular.ttf': 'NotoSansMono-Regular',
  'noto-sans-cjk-regular.ttf': 'NotoSansSC-Regular',
  'noto-sans-hangul-regular.ttf': 'NotoSansKR-Regular',
};

let loadFont: (file: FontFile) => Promise<ArrayBuffer> = async (file) => {
  const res = await fetch(`${FONT_BASE}/${file}`);
  if (!res.ok) throw new Error(`Font ${file}: HTTP ${res.status}`);
  return res.arrayBuffer();
};

/** Tests read the fonts from disk instead of fetching them. */
export function setFontLoader(loader: (file: FontFile) => Promise<ArrayBuffer>): void {
  loadFont = loader;
  fontCache.clear();
}

const fontCache = new Map<FontFile, Promise<string>>();

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fontData(file: FontFile): Promise<string> {
  let cached = fontCache.get(file);
  if (!cached) {
    cached = loadFont(file).then(base64);
    // A failed fetch shouldn't poison the next conversion.
    cached.catch(() => fontCache.delete(file));
    fontCache.set(file, cached);
  }
  return cached;
}

// Which family draws a character. Families map to a jsPDF font name.
type Family = 'sans' | 'mono' | 'cjk' | 'hangul';

function isHangul(cp: number): boolean {
  return (
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f)
  );
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) || // radicals, CJK punctuation, kana, ideographs
    (cp >= 0xf900 && cp <= 0xfaff) || // compatibility ideographs
    (cp >= 0xff00 && cp <= 0xffef) // full-width forms
  );
}

function familyOf(cp: number, mono: boolean): Family {
  if (isHangul(cp)) return 'hangul';
  if (isCjk(cp)) return 'cjk';
  return mono ? 'mono' : 'sans';
}

// WinAnsi (CP1252): what jsPDF's built-in fonts can encode.
const WINANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ', (c) => c.codePointAt(0)!));

function isWinAnsi(cp: number): boolean {
  return (
    cp === 9 ||
    cp === 10 ||
    cp === 13 ||
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) ||
    WINANSI_EXTRA.has(cp)
  );
}

function allText(blocks: Block[]): string {
  const out: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.kind === 'code') out.push(b.text);
      else if (b.kind === 'quote') walk(b.blocks);
      else if (b.kind === 'table')
        for (const row of [b.header, ...b.rows])
          for (const cell of row) for (const r of cell) out.push(r.text);
      else if (b.kind !== 'rule') {
        // Markers are drawn too, so they count towards the font choice.
        if (b.kind === 'list-item') out.push(b.marker);
        for (const r of b.runs) out.push(r.text);
      }
    }
  };
  walk(blocks);
  return out.join('\n');
}

interface FontSet {
  unicode: boolean;
  /** jsPDF font name + style for a family and weight. */
  resolve(family: Family, bold: boolean, italic: boolean): [string, string];
}

async function prepareFonts(doc: JsPDF, blocks: Block[]): Promise<FontSet> {
  const text = allText(blocks);
  const cps = Array.from(text, (c) => c.codePointAt(0)!);

  if (cps.every(isWinAnsi)) {
    return {
      unicode: false,
      resolve: (family, bold, italic) => {
        const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
        return [family === 'mono' ? 'courier' : 'helvetica', style];
      },
    };
  }

  const needs = new Set<FontFile>(['noto-sans-regular.ttf']);
  if (cps.some(isHangul)) needs.add('noto-sans-hangul-regular.ttf');
  if (cps.some(isCjk)) needs.add('noto-sans-cjk-regular.ttf');
  const wantsBold = (list: Block[]): boolean =>
    list.some(
      (b) =>
        b.kind === 'heading' ||
        b.kind === 'table' ||
        (b.kind === 'quote' && wantsBold(b.blocks)) ||
        ('runs' in b && b.runs.some((r) => r.bold)),
    );
  if (wantsBold(blocks)) needs.add('noto-sans-bold.ttf');
  const wantsMono = (list: Block[]): boolean =>
    list.some(
      (b) =>
        b.kind === 'code' ||
        (b.kind === 'quote' && wantsMono(b.blocks)) ||
        ('runs' in b && b.runs.some((r) => r.mono)),
    );
  if (wantsMono(blocks)) needs.add('noto-sans-mono-regular.ttf');

  const loaded = await Promise.all(
    [...needs].map(async (file) => [file, await fontData(file)] as const),
  );
  for (const [file, data] of loaded) {
    // jsPDF uses the VFS name as the PDF font name, which viewers show in the
    // document's font list, so register under the real PostScript name.
    doc.addFileToVFS(POSTSCRIPT[file], data);
    doc.addFont(POSTSCRIPT[file], POSTSCRIPT[file], 'normal', 'Identity-H');
  }
  const has = (file: FontFile) => needs.has(file);

  return {
    unicode: true,
    // No italic Noto is shipped: italic text is set upright rather than
    // doubling the download for a slant.
    resolve: (family, bold) => {
      if (family === 'hangul') return [POSTSCRIPT['noto-sans-hangul-regular.ttf'], 'normal'];
      if (family === 'cjk') return [POSTSCRIPT['noto-sans-cjk-regular.ttf'], 'normal'];
      if (family === 'mono' && has('noto-sans-mono-regular.ttf'))
        return [POSTSCRIPT['noto-sans-mono-regular.ttf'], 'normal'];
      if (bold && has('noto-sans-bold.ttf')) return [POSTSCRIPT['noto-sans-bold.ttf'], 'normal'];
      return [POSTSCRIPT['noto-sans-regular.ttf'], 'normal'];
    },
  };
}

// --- Layout --------------------------------------------------------------------

const PAGE_MARGIN = 50;
const BODY_SIZE = 11;
const HEADING_SIZES = [22, 18, 15, 13, 12, 11];
const CODE_SIZE = 9.5;

interface Piece {
  text: string;
  font: [string, string];
  size: number;
  width: number;
  space: boolean;
  link?: string;
  /** Can the line break before this piece? (Always between CJK characters.) */
  breakBefore: boolean;
  /** CJK or Hangul: a line may break after it even without a space. */
  cjk?: boolean;
}

class Typesetter {
  private y: number;
  private readonly width: number;
  private readonly pageHeight: number;
  private currentFont = '';

  constructor(
    private readonly doc: JsPDF,
    private readonly fonts: FontSet,
  ) {
    this.pageHeight = doc.internal.pageSize.getHeight();
    this.width = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
    this.y = PAGE_MARGIN;
  }

  private setFont([name, style]: [string, string], size: number): void {
    const key = `${name}/${style}/${size}`;
    if (key === this.currentFont) return;
    this.doc.setFont(name, style);
    this.doc.setFontSize(size);
    this.currentFont = key;
  }

  private measure(text: string, font: [string, string], size: number): number {
    this.setFont(font, size);
    return this.doc.getTextWidth(text);
  }

  private ensure(height: number): void {
    if (this.y + height > this.pageHeight - PAGE_MARGIN) {
      this.doc.addPage();
      this.y = PAGE_MARGIN;
    }
  }

  /** Runs → measured pieces: split per font, then at break opportunities. */
  private pieces(runs: Run[], size: number, preserve: boolean): Piece[] {
    const out: Piece[] = [];
    for (const run of runs) {
      let text = run.text.replace(/\t/g, '    ');
      if (!preserve) text = text.replace(/\s+/g, ' ');
      // Characters no shipped font has (emoji, rare scripts) would draw as
      // nothing, or as garbage in WinAnsi mode.
      const chars = Array.from(text, (ch) => {
        const cp = ch.codePointAt(0)!;
        // '?' rather than U+FFFD: no shipped font has a glyph for the latter,
        // so it would draw as an empty box and vanish from copy/paste.
        if (!this.fonts.unicode) return isWinAnsi(cp) ? ch : '?';
        return cp > 0xffff ? '?' : ch;
      });

      let i = 0;
      while (i < chars.length) {
        const cp = chars[i].codePointAt(0)!;
        const family = this.fonts.unicode ? familyOf(cp, !!run.mono) : run.mono ? 'mono' : 'sans';
        const font = this.fonts.resolve(family, !!run.bold, !!run.italic);
        if (/\s/.test(chars[i])) {
          let j = i;
          while (j < chars.length && /\s/.test(chars[j])) j++;
          const s = chars.slice(i, j).join('');
          out.push({
            text: s,
            font,
            size,
            width: this.measure(s, font, size),
            space: true,
            link: run.link,
            breakBefore: true,
          });
          i = j;
        } else if (family === 'cjk' || family === 'hangul') {
          // One CJK character per piece: lines may break between any two.
          // (Hangul is spaced like Latin, but per-syllable breaks are fine.)
          out.push({
            text: chars[i],
            font,
            size,
            width: this.measure(chars[i], font, size),
            space: false,
            link: run.link,
            breakBefore: true,
            cjk: true,
          });
          i++;
        } else {
          let j = i;
          while (j < chars.length && !/\s/.test(chars[j])) {
            const next = chars[j].codePointAt(0)!;
            if (this.fonts.unicode && familyOf(next, !!run.mono) !== family) break;
            j++;
          }
          const word = chars.slice(i, j).join('');
          const prev = out[out.length - 1];
          // Glued to the previous piece (e.g. "word," after a link run)
          // unless there was a space or a CJK character before it.
          const breakBefore = !prev || prev.space || !!prev.cjk;
          out.push({
            text: word,
            font,
            size,
            width: this.measure(word, font, size),
            space: false,
            link: run.link,
            breakBefore,
          });
          i = j;
        }
      }
    }
    return out;
  }

  /**
   * Greedy line breaking; words wider than the line are split by character.
   * With `preserve` (plain text, code, JSON) leading spaces are indentation
   * and stay; otherwise a wrapped line never starts with a space.
   */
  private lines(pieces: Piece[], width: number, preserve = false): Piece[][] {
    const lines: Piece[][] = [];
    let line: Piece[] = [];
    let used = 0;

    // True at the start of the text and right after an explicit newline,
    // where leading whitespace is real indentation (not a wrap artefact).
    let atHardBreak = true;
    const push = (hard = false) => {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      used = 0;
      atHardBreak = hard;
    };

    for (let k = 0; k < pieces.length; k++) {
      const piece = pieces[k];
      if (piece.text === '\n') {
        push(true);
        continue;
      }
      if (piece.space && line.length === 0 && (!preserve || !atHardBreak)) continue;

      // Keep glued pieces (no break opportunity) together with this one.
      let groupWidth = piece.width;
      for (let g = k + 1; g < pieces.length && !pieces[g].breakBefore; g++)
        groupWidth += pieces[g].width;

      if (used + groupWidth > width && line.length > 0 && piece.breakBefore) {
        push();
        if (piece.space) continue;
      }

      if (piece.width > width) {
        // A single overlong token (URL, hash): break it by character.
        let chunk = '';
        for (const ch of Array.from(piece.text)) {
          const w = this.measure(chunk + ch, piece.font, piece.size);
          if (used + w > width && (chunk || line.length)) {
            if (chunk)
              line.push({
                ...piece,
                text: chunk,
                width: this.measure(chunk, piece.font, piece.size),
              });
            push();
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk) {
          const w = this.measure(chunk, piece.font, piece.size);
          line.push({ ...piece, text: chunk, width: w });
          used += w;
        }
        continue;
      }

      line.push(piece);
      used += piece.width;
    }
    if (line.length || lines.length === 0) push();
    return lines;
  }

  // Consecutive pieces in the same font and link become one text call: smaller
  // files, and copy/paste gets real spaces instead of a viewer's guesses.
  private drawLine(line: Piece[], x: number, baseline: number): void {
    let cursor = x;
    let i = 0;
    while (i < line.length) {
      const first = line[i];
      let text = first.text;
      let width = first.width;
      let j = i + 1;
      while (
        j < line.length &&
        line[j].font[0] === first.font[0] &&
        line[j].font[1] === first.font[1] &&
        line[j].size === first.size &&
        line[j].link === first.link
      ) {
        text += line[j].text;
        width += line[j].width;
        j++;
      }
      if (text.trim()) {
        this.setFont(first.font, first.size);
        this.doc.setTextColor(first.link ? '#1a56db' : '#111111');
        this.doc.text(text, cursor, baseline);
        if (first.link) {
          this.doc.link(cursor, baseline - first.size, width, first.size * 1.2, {
            url: first.link,
          });
        }
      }
      cursor += width;
      i = j;
    }
    this.doc.setTextColor('#111111');
  }

  /** Runs → pieces, with each '\n' inside a run (a <br>) as a hard line break. */
  private layout(runs: Run[], size: number, preserve: boolean): Piece[] {
    const out: Piece[] = [];
    for (const run of runs) {
      run.text.split('\n').forEach((part, i) => {
        if (i > 0) {
          out.push({
            text: '\n',
            font: ['helvetica', 'normal'],
            size,
            width: 0,
            space: false,
            breakBefore: true,
          });
        }
        if (part) out.push(...this.pieces([{ ...run, text: part }], size, preserve));
      });
    }
    return out;
  }

  private text(
    runs: Run[],
    opts: { size: number; x: number; width: number; preserve?: boolean; lineHeight?: number },
  ): void {
    const lineHeight = opts.lineHeight ?? opts.size * 1.4;
    const preserve = !!opts.preserve;
    for (const line of this.lines(this.layout(runs, opts.size, preserve), opts.width, preserve)) {
      this.ensure(lineHeight);
      this.drawLine(line, opts.x, this.y + opts.size);
      this.y += lineHeight;
    }
  }

  block(block: Block, indent = 0): void {
    const nested = 'indent' in block ? (block.indent ?? 0) * 18 : 0;
    const x = PAGE_MARGIN + indent + nested;
    const width = this.width - indent - nested;
    switch (block.kind) {
      case 'paragraph':
        this.text(block.runs, { size: BODY_SIZE, x, width, preserve: block.preserve });
        this.y += block.spaceAfter ?? BODY_SIZE * 0.6;
        break;
      case 'heading': {
        const size = HEADING_SIZES[Math.min(block.level, 6) - 1];
        this.y += size * 0.5;
        this.ensure(size * 3); // don't strand a heading at the bottom of a page
        this.text(
          block.runs.map((r) => ({ ...r, bold: true })),
          { size, x, width, lineHeight: size * 1.25 },
        );
        this.y += size * 0.35;
        break;
      }
      case 'list-item': {
        const step = 18;
        const itemX = x + block.depth * step;
        this.ensure(BODY_SIZE * 1.4);
        const markerFont = this.fonts.resolve('sans', false, false);
        this.setFont(markerFont, BODY_SIZE);
        this.doc.setTextColor('#111111');
        this.doc.text(block.marker, itemX, this.y + BODY_SIZE);
        this.text(block.runs, {
          size: BODY_SIZE,
          x: itemX + step,
          width: width - block.depth * step - step,
        });
        this.y += BODY_SIZE * 0.25;
        break;
      }
      case 'code': {
        const lineHeight = CODE_SIZE * 1.45;
        const pad = 6;
        const text = block.text.replace(/\n$/, '');
        const lines = this.lines(
          this.layout([{ text, mono: true }], CODE_SIZE, true),
          width - pad * 2,
          true, // indentation is the point of a code block
        );
        this.y += 2;
        for (const line of lines) {
          this.ensure(lineHeight);
          // Background per line so a code block can cross a page break.
          this.doc.setFillColor('#f3f4f6');
          this.doc.rect(x, this.y, width, lineHeight, 'F');
          this.drawLine(line, x + pad, this.y + CODE_SIZE + 2);
          this.y += lineHeight;
        }
        this.y += BODY_SIZE * 0.8;
        break;
      }
      case 'quote': {
        const start = this.y;
        const startPage = this.doc.getNumberOfPages();
        for (const inner of block.blocks) this.block(inner, indent + 14);
        if (this.doc.getNumberOfPages() === startPage) {
          this.doc.setDrawColor('#d1d5db');
          this.doc.setLineWidth(2);
          this.doc.line(x + 3, start, x + 3, this.y - BODY_SIZE * 0.6);
        }
        break;
      }
      case 'rule':
        this.ensure(12);
        this.doc.setDrawColor('#d1d5db');
        this.doc.setLineWidth(0.75);
        this.doc.line(x, this.y + 6, x + width, this.y + 6);
        this.y += 16;
        break;
      case 'table':
        this.table(block, x, width);
        break;
    }
  }

  private table(block: Extract<Block, { kind: 'table' }>, x: number, width: number): void {
    const size = 9.5;
    const pad = 4;
    const lineHeight = size * 1.35;
    const columns = Math.max(block.header.length, ...block.rows.map((r) => r.length));
    if (columns === 0) return;
    const colWidth = width / columns;

    const drawRow = (cells: Run[][], header: boolean) => {
      const laid = Array.from({ length: columns }, (_, c) =>
        this.lines(
          this.pieces(
            (cells[c] ?? []).map((r) => ({ ...r, bold: r.bold || header })),
            size,
            false,
          ),
          colWidth - pad * 2,
        ),
      );
      const height = Math.max(...laid.map((l) => l.length)) * lineHeight + pad * 2;
      this.ensure(height);
      if (header) {
        this.doc.setFillColor('#f3f4f6');
        this.doc.rect(x, this.y, width, height, 'F');
      }
      this.doc.setDrawColor('#d1d5db');
      this.doc.setLineWidth(0.5);
      laid.forEach((lines, c) => {
        const cx = x + c * colWidth;
        this.doc.rect(cx, this.y, colWidth, height);
        lines.forEach((line, i) =>
          this.drawLine(line, cx + pad, this.y + pad + size + i * lineHeight),
        );
      });
      this.y += height;
    };

    drawRow(block.header, true);
    for (const row of block.rows) drawRow(row, false);
    this.y += BODY_SIZE * 0.8;
  }
}

export async function renderPdf(blocks: Block[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fonts = await prepareFonts(doc, blocks);
  doc.setTextColor('#111111');
  const setter = new Typesetter(doc, fonts);
  for (const block of blocks) setter.block(block);
  return doc.output('blob');
}

/** Plain text: one paragraph per source line, whitespace kept, blank lines kept. */
export function textBlocks(text: string, mono = false): Block[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({
      kind: 'paragraph' as const,
      runs: [{ text: line, mono }],
      preserve: true,
      spaceAfter: 0,
    }));
}
