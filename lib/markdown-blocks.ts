import { marked, type Token, type Tokens } from 'marked';
import type { Block, Run } from './pdf-layout';

// Markdown → typeset blocks, from marked's token tree rather than its HTML, so
// MD → PDF keeps headings, emphasis, lists, code, quotes and tables and needs
// no DOM (it runs in the worker pool).

interface Style {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  link?: string;
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  deg: '°',
  euro: '€',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const cp =
        body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

// Raw HTML inside Markdown: keep its text, turn <br> and block ends into
// newlines, drop scripts and styles with their content.
function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
}

function inline(tokens: Token[] | undefined, style: Style = {}): Run[] {
  const runs: Run[] = [];
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'strong':
        runs.push(...inline((token as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case 'em':
        runs.push(...inline((token as Tokens.Em).tokens, { ...style, italic: true }));
        break;
      case 'del':
        runs.push(...inline((token as Tokens.Del).tokens, style));
        break;
      case 'codespan':
        runs.push({ text: decodeEntities((token as Tokens.Codespan).text), ...style, mono: true });
        break;
      case 'link': {
        const link = token as Tokens.Link;
        const href = /^(https?:|mailto:)/i.test(link.href) ? link.href : undefined;
        runs.push(...inline(link.tokens, { ...style, link: href ?? style.link }));
        break;
      }
      case 'image': {
        const alt = (token as Tokens.Image).text;
        if (alt) runs.push({ text: `[${alt}]`, ...style, italic: true });
        break;
      }
      case 'br':
        runs.push({ text: '\n', ...style });
        break;
      case 'html':
        runs.push({ text: htmlText((token as Tokens.HTML).text), ...style });
        break;
      case 'text': {
        const text = token as Tokens.Text;
        if (text.tokens?.length) runs.push(...inline(text.tokens, style));
        else runs.push({ text: decodeEntities(text.text), ...style });
        break;
      }
      case 'escape':
        runs.push({ text: (token as Tokens.Escape).text, ...style });
        break;
      default:
        if ('text' in token && typeof token.text === 'string') {
          runs.push({ text: decodeEntities(token.text), ...style });
        }
    }
  }
  return runs;
}

function blocks(tokens: Token[], depth = 0): Block[] {
  const out: Block[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading;
        out.push({ kind: 'heading', level: heading.depth, runs: inline(heading.tokens) });
        break;
      }
      case 'paragraph':
        out.push({ kind: 'paragraph', runs: inline((token as Tokens.Paragraph).tokens) });
        break;
      case 'text': {
        // Loose text directly inside a list item.
        const text = token as Tokens.Text;
        out.push({ kind: 'paragraph', runs: inline(text.tokens ?? [text]), spaceAfter: 2 });
        break;
      }
      case 'code':
        out.push({ kind: 'code', text: (token as Tokens.Code).text });
        break;
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocks((token as Tokens.Blockquote).tokens, depth) });
        break;
      case 'hr':
        out.push({ kind: 'rule' });
        break;
      case 'list': {
        const list = token as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        list.items.forEach((item, i) => {
          // WinAnsi-safe markers, so a plain-English list doesn't force the
          // Unicode fonts to download.
          const marker = item.task
            ? item.checked
              ? '[x]'
              : '[ ]'
            : list.ordered
              ? `${start + i}.`
              : depth % 2 === 0
                ? '•'
                : '–';
          // The first paragraph sits beside the marker; everything after it
          // (more paragraphs, nested lists) follows, indented one level.
          const [first, ...rest] = item.tokens.filter(
            (t) => t.type !== 'space' && t.type !== 'checkbox',
          );
          const firstRuns =
            first && (first.type === 'text' || first.type === 'paragraph')
              ? inline((first as Tokens.Text).tokens ?? [first])
              : [];
          out.push({ kind: 'list-item', depth, marker, runs: firstRuns });
          const remaining = firstRuns.length ? rest : [first, ...rest].filter(Boolean);
          for (const block of blocks(remaining, depth + 1)) {
            out.push(block.kind === 'list-item' ? block : indentBlock(block, depth + 1));
          }
        });
        break;
      }
      case 'table': {
        const table = token as Tokens.Table;
        out.push({
          kind: 'table',
          header: table.header.map((cell) => inline(cell.tokens)),
          rows: table.rows.map((row) => row.map((cell) => inline(cell.tokens))),
        });
        break;
      }
      case 'html': {
        const text = htmlText((token as Tokens.HTML).text).trim();
        if (text) out.push({ kind: 'paragraph', runs: [{ text }] });
        break;
      }
      default:
        break; // space, def: no output
    }
  }
  return out;
}

// Continuation paragraphs, code and tables inside a list item line up under
// the item's text rather than the page margin.
function indentBlock(block: Block, depth: number): Block {
  return block.kind === 'paragraph' || block.kind === 'code' || block.kind === 'table'
    ? { ...block, indent: depth }
    : block;
}

export function markdownBlocks(markdown: string): Block[] {
  return blocks(marked.lexer(markdown));
}
