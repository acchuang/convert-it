// DOCX output, written by hand on jszip (already a dependency): the same
// Block model the PDF typesetter uses (lib/pdf-layout.ts), so Markdown, HTML
// and text keep their headings, emphasis, links, lists, code, quotes and
// tables in Word. The package is the minimum Word, LibreOffice and Pages
// accept: content types, relationships, document, styles and numbering.

import type { Block, Run } from './pdf-layout';
import { escapeXml } from './markup';

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// XML 1.0 forbids most C0 controls; Word refuses a file that has one.
const ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const xml = (s: string) => escapeXml(s.replace(ILLEGAL, ''));

interface Context {
  links: string[]; // hyperlink targets; relationship ids follow the fixed ones
  // One Word list per source list. Each level's format (bullet, or numbered
  // from some start) comes from the first item seen at that depth, so a
  // numbered list nested in a bulleted one stays numbered.
  lists: Map<number, { ordered: boolean; start: number }>[];
}

// Word validates element order against the schema: in w:rPr, rStyle comes
// first, then b, then i. Built in that order, never by concatenation.
function rPr(style: string | undefined, bold?: boolean, italic?: boolean): string {
  const props =
    (style ? `<w:rStyle w:val="${style}"/>` : '') +
    (bold ? '<w:b/>' : '') +
    (italic ? '<w:i/>' : '');
  return props ? `<w:rPr>${props}</w:rPr>` : '';
}

function runXml(run: Run, ctx: Context, forceBold = false): string {
  // Line breaks inside a run (preserved text) become <w:br/>.
  const text = run.text
    .split('\n')
    .map((part) => `<w:t xml:space="preserve">${xml(part)}</w:t>`)
    .join('<w:br/>');
  const bold = run.bold || forceBold;
  if (!run.link) {
    return `<w:r>${rPr(run.mono ? 'CodeChar' : undefined, bold, run.italic)}${text}</w:r>`;
  }
  ctx.links.push(run.link);
  const id = `rIdLink${ctx.links.length}`;
  return `<w:hyperlink r:id="${id}"><w:r>${rPr('Hyperlink', bold, run.italic)}${text}</w:r></w:hyperlink>`;
}

const runsXml = (runs: Run[], ctx: Context, bold = false) =>
  runs.map((run) => runXml(run, ctx, bold)).join('');

function paragraph(inner: string, props = ''): string {
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`;
}

function tableXml(block: Extract<Block, { kind: 'table' }>, ctx: Context): string {
  const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length), 1);
  const cell = (runs: Run[] | undefined, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paragraph(
      runsXml(runs ?? [], ctx, header),
    )}</w:tc>`;
  const row = (cells: Run[][], header: boolean) =>
    `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from(
      { length: cols },
      (_, i) => cell(cells[i], header),
    ).join('')}</w:tr>`;
  const grid = Array.from({ length: cols }, () => '<w:gridCol/>').join('');
  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>` +
    (block.header.length ? row(block.header, true) : '') +
    block.rows.map((r) => row(r, false)).join('') +
    '</w:tbl>' +
    paragraph('') // Word needs a paragraph between a table and what follows
  );
}

function blocksXml(blocks: Block[], ctx: Context, style?: string): string {
  const out: string[] = [];
  let list: number | null = null; // w:numId of the list being written
  for (const block of blocks) {
    if (block.kind !== 'list-item') list = null;
    const pStyle = (name: string) => `<w:pStyle w:val="${style ?? name}"/>`;
    switch (block.kind) {
      case 'heading':
        out.push(
          paragraph(
            runsXml(block.runs, ctx),
            `<w:pStyle w:val="Heading${Math.min(6, block.level)}"/>`,
          ),
        );
        break;
      case 'paragraph':
        out.push(
          paragraph(
            runsXml(block.runs, ctx),
            (style ? pStyle('') : '') +
              (block.indent ? `<w:ind w:left="${block.indent * 360}"/>` : ''),
          ),
        );
        break;
      case 'list-item': {
        const ordered = /^\d+[.)]$/.test(block.marker);
        const depth = Math.min(8, block.depth);
        // A top-level item of the other kind starts a new list.
        const top = list === null ? undefined : ctx.lists[list - 1].get(0);
        if (list === null || (depth === 0 && top && top.ordered !== ordered)) {
          ctx.lists.push(new Map());
          list = ctx.lists.length;
        }
        const levels = ctx.lists[list - 1];
        if (!levels.has(depth)) {
          levels.set(depth, { ordered, start: ordered ? parseInt(block.marker, 10) || 1 : 1 });
        }
        out.push(
          paragraph(
            runsXml(block.runs, ctx),
            `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${depth}"/><w:numId w:val="${list}"/></w:numPr>`,
          ),
        );
        break;
      }
      case 'code':
        for (const line of block.text.split('\n')) {
          out.push(paragraph(runXml({ text: line }, ctx), '<w:pStyle w:val="Code"/>'));
        }
        break;
      case 'quote':
        out.push(blocksXml(block.blocks, ctx, 'Quote'));
        break;
      case 'rule':
        out.push(
          paragraph(
            '',
            '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>',
          ),
        );
        break;
      case 'table':
        out.push(tableXml(block, ctx));
        break;
    }
  }
  return out.join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (n) =>
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${
        n <= 2 ? 360 : 240
      }" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${
        [40, 32, 28, 24, 22, 22][n - 1]
      }"/></w:rPr></w:style>`,
  )
  .join('\n')}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BBBBBB"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

function numberingXml(lists: Context['lists']): string {
  const BULLETS = ['•', '◦', '▪'];
  const level = (ilvl: number, fmt: { ordered: boolean; start: number } | undefined) => {
    const ordered = fmt?.ordered ?? false;
    return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${fmt?.start ?? 1}"/><w:numFmt w:val="${
      ordered ? ['decimal', 'lowerLetter', 'lowerRoman'][ilvl % 3] : 'bullet'
    }"/><w:lvlText w:val="${ordered ? `%${ilvl + 1}.` : BULLETS[ilvl % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${
      720 + ilvl * 360
    }" w:hanging="360"/></w:pPr></w:lvl>`;
  };
  const abstracts = lists
    .map(
      (levels, i) =>
        `<w:abstractNum w:abstractNumId="${i}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from(
          { length: 9 },
          (_, ilvl) => level(ilvl, levels.get(ilvl)),
        ).join('')}</w:abstractNum>`,
    )
    .join('');
  const nums = lists
    .map((_, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_NS}>${abstracts}${nums}</w:numbering>`;
}

/** A .docx of the blocks. */
export async function blocksToDocx(blocks: Block[], title = ''): Promise<Blob> {
  const ctx: Context = { links: [], lists: [] };
  const body = blocksXml(blocks, ctx);
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body || paragraph('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const links = ctx.links
    .map(
      (target, i) =>
        `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(
          target,
        )}" TargetMode="External"/>`,
    )
    .join('');

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(
      title,
    )}</dc:title><dc:creator>Convert-it</dc:creator></cp:coreProperties>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${links}</Relationships>`,
  );
  zip.file('word/document.xml', document);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', numberingXml(ctx.lists));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}
