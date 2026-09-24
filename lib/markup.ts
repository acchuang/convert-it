// Shared escaping for every converter that writes XML or HTML by hand. Before
// this lived in one place, cell values went out raw: `AT&T` made the XML
// unparseable, and a `<script>` in a CSV cell ran when the HTML table opened.

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Turns an arbitrary column/key name into a legal XML element name. Spreadsheet
 * headers are routinely `First Name`, `2024` or `a/b`, none of which may be a
 * tag. Illegal characters become `_`, and a name that can't start an element
 * (digit, dot, hyphen, or the reserved `xml` prefix) gets a leading `_`.
 */
export function xmlName(raw: string, fallback = 'field'): string {
  let name = raw.trim().replace(NOT_NAME_CHAR, '_');
  if (!name) return fallback;
  if (!NAME_START_CHAR.test(name) || /^xml/i.test(name)) name = `_${name}`;
  return name;
}

// XML 1.0 (5th ed.) NameStartChar / NameChar, BMP only; astral characters
// (emoji) fall outside both classes and become `_`.
const START_RANGES =
  'A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME_START_CHAR = new RegExp(`^[${START_RANGES}]`);
const NOT_NAME_CHAR = new RegExp(
  `[^${START_RANGES}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]`,
  'gu',
);

/** Text for a table cell or XML leaf: nested structures are kept as JSON rather than `[object Object]`. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function valueToXml(key: string, value: unknown, depth: number): string {
  const pad = '  '.repeat(depth);
  const tag = xmlName(key);
  if (Array.isArray(value)) {
    return value.map((item) => valueToXml(key, item, depth)).join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const children = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => valueToXml(k, v, depth + 1))
      .join('\n');
    return children ? `${pad}<${tag}>\n${children}\n${pad}</${tag}>` : `${pad}<${tag}/>`;
  }
  return `${pad}<${tag}>${escapeXml(cellText(value))}</${tag}>`;
}

/** `<root><row>…</row>…</root>` — the tabular XML shape every data converter emits. */
export function rowsToXml(rows: Record<string, unknown>[], rootElement: string): string {
  const root = xmlName(rootElement, 'root');
  const body = rows
    .map((row) => {
      const fields = Object.entries(row)
        .map(([k, v]) => valueToXml(k, v, 2))
        .join('\n');
      return fields ? `  <row>\n${fields}\n  </row>` : '  <row/>';
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`;
}

export function rowsToHtmlTable(headers: string[], rows: Record<string, unknown>[]): string {
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = rows
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${escapeHtml(cellText(row[h]))}</td>`).join('')}</tr>`,
    )
    .join('\n');
  return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n<table border="1">\n${thead}\n<tbody>\n${tbody}\n</tbody>\n</table>\n</body>\n</html>`;
}
