// HTML → readable plain text, for htmlToTxt and every text-flavoured PDF.
//
// Two things the old `div.innerHTML = html; div.textContent` got wrong:
//  - innerHTML on an element owned by the live document fires handlers such as
//    `<img src=x onerror=…>`, so converting a crafted .html ran script in the
//    app origin. DOMParser returns an inert document: nothing loads or executes.
//  - textContent joins block elements with no separator, so `<p>a</p><p>b</p>`
//    became "ab" and every line break in the output was lost.

const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
  'IFRAME',
  'OBJECT',
  'SVG',
]);

const BLOCK = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TFOOT',
  'THEAD',
  'TR',
  'UL',
]);

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let out = '';

  const newline = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };

  const walk = (node: Node, inPre: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (inPre) {
        out += text;
      } else {
        const collapsed = text.replace(/\s+/g, ' ');
        // Don't open a line with the whitespace between two tags.
        out += out === '' || out.endsWith('\n') ? collapsed.trimStart() : collapsed;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === 'BR') {
      out += '\n';
      return;
    }

    const block = BLOCK.has(tag);
    if (block) newline();
    if (tag === 'LI') out += '• ';
    if (tag === 'TD' || tag === 'TH') {
      if (el.previousElementSibling) out += '\t';
    }

    const pre = inPre || tag === 'PRE';
    for (const child of Array.from(el.childNodes)) walk(child, pre);

    if (block) {
      newline();
      // Paragraph-level blocks get a blank line after them, like a browser's margins.
      if (/^(P|H[1-6]|BLOCKQUOTE|PRE|TABLE|UL|OL|HR)$/.test(tag)) out += '\n';
    }
  };

  walk(doc.body ?? doc.documentElement, false);

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
