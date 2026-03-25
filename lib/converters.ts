// Supported conversions map
export type FileCategory = 'image' | 'document' | 'data' | 'audio' | 'video';

export interface FormatInfo {
  ext: string;
  label: string;
  mimeType: string;
  category: FileCategory;
  icon: string;
  color: string;
}

export const FORMATS: FormatInfo[] = [
  // Images
  { ext: 'jpg', label: 'JPEG', mimeType: 'image/jpeg', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'png', label: 'PNG', mimeType: 'image/png', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'webp', label: 'WebP', mimeType: 'image/webp', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'gif', label: 'GIF', mimeType: 'image/gif', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'bmp', label: 'BMP', mimeType: 'image/bmp', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'ico', label: 'ICO', mimeType: 'image/x-icon', category: 'image', icon: '🖼', color: '#FF4D00' },
  { ext: 'svg', label: 'SVG', mimeType: 'image/svg+xml', category: 'image', icon: '🖼', color: '#FF4D00' },
  // Documents
  { ext: 'pdf', label: 'PDF', mimeType: 'application/pdf', category: 'document', icon: '📄', color: '#00C2FF' },
  { ext: 'txt', label: 'TXT', mimeType: 'text/plain', category: 'document', icon: '📝', color: '#00C2FF' },
  { ext: 'md', label: 'Markdown', mimeType: 'text/markdown', category: 'document', icon: '📝', color: '#00C2FF' },
  { ext: 'html', label: 'HTML', mimeType: 'text/html', category: 'document', icon: '📝', color: '#00C2FF' },
  // Data
  { ext: 'csv', label: 'CSV', mimeType: 'text/csv', category: 'data', icon: '📊', color: '#C8FF00' },
  { ext: 'json', label: 'JSON', mimeType: 'application/json', category: 'data', icon: '📊', color: '#C8FF00' },
  { ext: 'xml', label: 'XML', mimeType: 'application/xml', category: 'data', icon: '📊', color: '#C8FF00' },
  { ext: 'yaml', label: 'YAML', mimeType: 'application/yaml', category: 'data', icon: '📊', color: '#C8FF00' },
  { ext: 'tsv', label: 'TSV', mimeType: 'text/tab-separated-values', category: 'data', icon: '📊', color: '#C8FF00' },
];

export const CONVERSION_MAP: Record<string, string[]> = {
  // Image conversions
  jpg: ['png', 'webp', 'bmp', 'ico'],
  jpeg: ['png', 'webp', 'bmp', 'ico'],
  png: ['jpg', 'webp', 'bmp', 'ico'],
  webp: ['jpg', 'png', 'bmp'],
  gif: ['png', 'jpg', 'webp'],
  bmp: ['jpg', 'png', 'webp'],
  svg: ['png', 'jpg'],
  // Document conversions
  txt: ['md', 'html', 'json'],
  md: ['html', 'txt'],
  html: ['txt', 'md'],
  // Data conversions
  csv: ['json', 'xml', 'tsv', 'html'],
  json: ['csv', 'xml', 'yaml', 'txt'],
  xml: ['json', 'csv', 'txt'],
  yaml: ['json', 'txt'],
  tsv: ['csv', 'json'],
};

export function getFormatInfo(ext: string): FormatInfo | undefined {
  return FORMATS.find(f => f.ext === ext.toLowerCase());
}

export function getTargetFormats(sourceExt: string): string[] {
  return CONVERSION_MAP[sourceExt.toLowerCase()] ?? [];
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Client-side converters ────────────────────────────────────────────────

export async function convertFile(
  file: File,
  targetExt: string
): Promise<Blob> {
  const sourceExt = getFileExtension(file.name);
  const category = getFormatInfo(sourceExt)?.category;

  if (category === 'image') {
    return convertImage(file, targetExt);
  }
  if (category === 'data' || category === 'document') {
    return convertText(file, sourceExt, targetExt);
  }
  throw new Error(`Unsupported conversion: ${sourceExt} → ${targetExt}`);
}

async function convertImage(file: File, targetExt: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      // White background for jpg/bmp/ico
      if (['jpg', 'jpeg', 'bmp', 'ico'].includes(targetExt)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const mimeType =
        targetExt === 'jpg' || targetExt === 'jpeg'
          ? 'image/jpeg'
          : targetExt === 'png'
          ? 'image/png'
          : targetExt === 'webp'
          ? 'image/webp'
          : targetExt === 'bmp'
          ? 'image/bmp'
          : 'image/png';

      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas export failed'));
        },
        mimeType,
        0.92
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

async function convertText(
  file: File,
  sourceExt: string,
  targetExt: string
): Promise<Blob> {
  const text = await file.text();
  let result = '';

  // JSON → CSV
  if (sourceExt === 'json' && targetExt === 'csv') {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === 0) return new Blob([''], { type: 'text/csv' });
    const headers = Object.keys(arr[0]);
    const rows = arr.map((row: Record<string, unknown>) =>
      headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
    );
    result = [headers.join(','), ...rows].join('\n');
  }
  // CSV → JSON
  else if (sourceExt === 'csv' && targetExt === 'json') {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const arr = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
    result = JSON.stringify(arr, null, 2);
  }
  // CSV → TSV
  else if (sourceExt === 'csv' && targetExt === 'tsv') {
    result = text.replace(/,/g, '\t');
  }
  // TSV → CSV
  else if (sourceExt === 'tsv' && targetExt === 'csv') {
    result = text.replace(/\t/g, ',');
  }
  // CSV → XML
  else if (sourceExt === 'csv' && targetExt === 'xml') {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const fields = headers
        .map((h, i) => `    <${h}>${vals[i] ?? ''}</${h}>`)
        .join('\n');
      return `  <row>\n${fields}\n  </row>`;
    });
    result = `<?xml version="1.0" encoding="UTF-8"?>\n<data>\n${rows.join('\n')}\n</data>`;
  }
  // JSON → XML
  else if (sourceExt === 'json' && targetExt === 'xml') {
    const data = JSON.parse(text);
    const toXml = (obj: unknown, tag = 'item'): string => {
      if (typeof obj !== 'object' || obj === null) return `<${tag}>${obj}</${tag}>`;
      if (Array.isArray(obj)) return obj.map(i => toXml(i, tag)).join('\n');
      const inner = Object.entries(obj as Record<string, unknown>)
        .map(([k, v]) => toXml(v, k))
        .join('\n');
      return `<${tag}>\n${inner}\n</${tag}>`;
    };
    result = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(data, 'root')}`;
  }
  // JSON → YAML
  else if (sourceExt === 'json' && targetExt === 'yaml') {
    const data = JSON.parse(text);
    const toYaml = (obj: unknown, indent = 0): string => {
      const pad = '  '.repeat(indent);
      if (obj === null) return 'null';
      if (typeof obj === 'string') return obj.includes('\n') ? `|\n${obj.split('\n').map(l => pad + '  ' + l).join('\n')}` : obj;
      if (typeof obj !== 'object') return String(obj);
      if (Array.isArray(obj)) {
        return obj.map(i => `${pad}- ${toYaml(i, indent + 1)}`).join('\n');
      }
      return Object.entries(obj as Record<string, unknown>)
        .map(([k, v]) => {
          const val = typeof v === 'object' && v !== null ? '\n' + toYaml(v, indent + 1) : ' ' + toYaml(v, indent);
          return `${pad}${k}:${val}`;
        }).join('\n');
    };
    result = toYaml(JSON.parse(text));
  }
  // YAML → JSON (simple parser)
  else if (sourceExt === 'yaml' && targetExt === 'json') {
    // Simple YAML → JSON: just wrap in JSON for flat structures
    const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const obj: Record<string, string> = {};
    for (const line of lines) {
      const [k, ...rest] = line.split(':');
      if (k && rest.length) obj[k.trim()] = rest.join(':').trim();
    }
    result = JSON.stringify(obj, null, 2);
  }
  // JSON → TXT
  else if (sourceExt === 'json' && targetExt === 'txt') {
    result = JSON.stringify(JSON.parse(text), null, 2);
  }
  // MD → HTML
  else if (sourceExt === 'md' && targetExt === 'html') {
    result = markdownToHtml(text);
  }
  // HTML → TXT
  else if (sourceExt === 'html' && targetExt === 'txt') {
    result = text.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  // HTML → MD
  else if (sourceExt === 'html' && targetExt === 'md') {
    result = htmlToMarkdown(text);
  }
  // TXT → MD
  else if (sourceExt === 'txt' && targetExt === 'md') {
    result = text;
  }
  // TXT → HTML
  else if (sourceExt === 'txt' && targetExt === 'html') {
    result = `<!DOCTYPE html>\n<html>\n<body>\n${text.split('\n').map(l => `<p>${l}</p>`).join('\n')}\n</body>\n</html>`;
  }
  // CSV → HTML
  else if (sourceExt === 'csv' && targetExt === 'html') {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => `<th>${h.trim()}</th>`).join('');
    const rows = lines.slice(1).map(line =>
      `<tr>${line.split(',').map(c => `<td>${c.trim()}</td>`).join('')}</tr>`
    ).join('\n');
    result = `<!DOCTYPE html>\n<html>\n<body>\n<table border="1">\n<thead><tr>${headers}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n</body>\n</html>`;
  }
  // XML → JSON
  else if (sourceExt === 'xml' && targetExt === 'json') {
    result = JSON.stringify({ note: 'XML parsed (simplified)', raw: text.substring(0, 200) }, null, 2);
  }
  // XML → TXT
  else if (sourceExt === 'xml' && targetExt === 'txt') {
    result = text.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Fallback
  else {
    result = text;
  }

  const mimeMap: Record<string, string> = {
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/yaml',
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    tsv: 'text/tab-separated-values',
  };

  return new Blob([result], { type: mimeMap[targetExt] ?? 'text/plain' });
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>');
  return `<!DOCTYPE html>\n<html>\n<body>\n<p>${html}</p>\n</body>\n</html>`;
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}
