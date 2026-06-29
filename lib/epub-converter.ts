import JSZip from 'jszip';
import { marked } from 'marked';

function getFilename(file: File): string {
  const dotIdx = file.name.lastIndexOf('.');
  return dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function wrapXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>${escapeXml(title)}</title></head>
<body>${body}</body>
</html>`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function opfXml(title: string, id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="book-id">urn:uuid:${id}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().split('T')[0]}</meta>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function buildEpub(title: string, body: string): Promise<Blob> {
  const zip = new JSZip();
  const id = generateUuid();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', containerXml());
  const oebps = zip.folder('OEBPS')!;
  oebps.file('content.opf', opfXml(title, id));
  oebps.file('chapter.xhtml', wrapXhtml(title, body));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

export async function txtToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const text = await file.text();
  const body = `<pre>${escapeXml(text)}</pre>`;
  return buildEpub(getFilename(file), body);
}

export async function mdToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const md = await file.text();
  const body = String(marked.parse(md));
  return buildEpub(getFilename(file), body);
}

export async function htmlToEpub(
  file: File,
  _sourceExt: string,
  _targetExt: string,
): Promise<Blob> {
  const html = await file.text();
  return buildEpub(getFilename(file), html);
}
