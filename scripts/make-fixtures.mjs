// Builds the smoke-test fixtures. node-canvas is already a devDependency (vitest uses
// it for the image converters), so the PNG comes from that rather than a hand-rolled
// encoder. The WebM has to come from a real browser — MediaRecorder is the only encoder
// available without adding a dependency — so playwright writes it in a separate pass.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from 'canvas';

const DIR = join(process.cwd(), '.smoke-fixtures');
mkdirSync(DIR, { recursive: true });

const canvas = createCanvas(64, 48);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#C8FF00';
ctx.fillRect(0, 0, 64, 48);
ctx.fillStyle = '#FF4D00';
ctx.fillRect(8, 8, 24, 24);
writeFileSync(join(DIR, 'img.png'), canvas.toBuffer('image/png'));

// OCR: text as pixels, and the same as a "scanned" PDF with no text layer.
{
  const text = createCanvas(900, 200);
  const tctx = text.getContext('2d');
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, 900, 200);
  tctx.fillStyle = '#111';
  tctx.font = '44px sans-serif';
  tctx.fillText('Convert-it reads printed text', 30, 80);
  tctx.fillText('Invoice 2026 total 314 EUR', 30, 150);
  const png = text.toBuffer('image/png');
  writeFileSync(join(DIR, 'ocr.png'), png);
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(new Uint8Array(png));
  doc.addPage([450, 100]).drawImage(image, { x: 0, y: 0, width: 450, height: 100 });
  writeFileSync(join(DIR, 'scan.pdf'), await doc.save());
}

// Subtitles as they circulate: BOM, CRLF, a missing cue number, "." before
// the milliseconds, a <font> tag.
writeFileSync(
  join(DIR, 'sub.srt'),
  '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\n<font color="#ff0">Hello</font> <i>there</i>\r\n\r\n' +
    '00:00:04.200 --> 00:00:06,000\r\nSecond line\r\n',
);

// A Word document from another producer (python-docx on Word's default
// template), shared with the unit tests.
copyFileSync(
  join(process.cwd(), 'lib', '__tests__', 'fixtures', 'python-docx-sample.docx'),
  join(DIR, 'notes.docx'),
);

// A geotagged JPEG: the same pixels with an EXIF block (camera, date, and a
// location at the Eiffel Tower) in APP1. The TIFF bytes were made by
// buildExif in lib/image-metadata.ts, which is tested against exifr.
{
  const tiff = Buffer.from(
    'TU0AKgAAAAgABQEPAAIAAAALAAAASgEQAAIAAAASAAAAVgESAAMAAAABAAEAAIdpAAQAAAABAAAAaIglAAQAAAABAAAAjgAAAABDb252ZXJ0LWl0AABTbW9rZSBUZXN0IENhbWVyYQAAAZADAAIAAAAUAAAAegAAAAAyMDI0OjA1OjAxIDE0OjAzOjIyAAAFAAAAAQAAAAQCAgAAAAEAAgAAAAJOAAAAAAIABQAAAAMAAADQAAMAAgAAAAJFAAAAAAQABQAAAAMAAADoAAAAAAAAADAAAAABAAAAMwAAAAEABJ1AAAAnEAAAAAIAAAABAAAAEQAAAAEABiJQAAAnEA==',
    'base64',
  );
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
    payload,
  ]);
  const jpeg = canvas.toBuffer('image/jpeg');
  writeFileSync(join(DIR, 'geo.jpg'), Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]));
}

// The same pixels as JPEG XL, for the jxl → png pair. No browser in CI decodes
// JXL, so the fixture comes from the codec the app ships (its glue fetches the
// wasm even under Node, hence the fetch shim).
{
  const wasm = join(process.cwd(), 'public', 'wasm');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (path) =>
    new Response(readFileSync(String(path)), { headers: { 'content-type': 'application/wasm' } });
  const { default: factory } = await import('@jsquash/jxl/codec/enc/jxl_enc.js');
  const { defaultOptions } = await import('@jsquash/jxl/meta.js');
  const jxl = await factory({ noInitialRun: true, locateFile: (f) => join(wasm, f) });
  const { data } = ctx.getImageData(0, 0, 64, 48);
  writeFileSync(join(DIR, 'img.jxl'), jxl.encode(data, 64, 48, { ...defaultOptions, quality: 90 }));
  globalThis.fetch = realFetch;
}

// 0.5s 440Hz mono 16-bit PCM.
const rate = 8000;
const frames = rate / 2;
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + frames * 2, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++) {
  wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
}
writeFileSync(join(DIR, 'audio.wav'), wav);

writeFileSync(join(DIR, 'data.csv'), 'name,qty,price\nwidget,3,9.99\ngadget,12,4.50\n');
writeFileSync(
  join(DIR, 'data.json'),
  JSON.stringify(
    [
      { name: 'widget', qty: 3 },
      { name: 'gadget', qty: 12 },
    ],
    null,
    2,
  ),
);
writeFileSync(
  join(DIR, 'doc.md'),
  '# Title\n\nSome **bold** text and a [link](https://example.com).\n\n## Part two\n\nLine<br>break & a [jump](#title).\n',
);
writeFileSync(
  join(DIR, 'data.xml'),
  '<catalog><meta><v>1</v></meta><book id="1"><title>Dune</title></book><book id="2"><title>Ubik</title></book></catalog>',
);
writeFileSync(join(DIR, 'doc.txt'), 'Plain text line one.\nPlain text line two.\n');

writeFileSync(
  join(DIR, 'img.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#C8FF00"/><text x="8" y="26" font-size="16">Hello</text></svg>',
);

// Smallest valid one-page PDF, written by hand so pdfium has something to render.
// The xref offsets are computed, not hard-coded, so editing an object stays safe.
{
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 44 >>\nstream\nBT /F1 18 Tf 20 50 Td (Hello PDF) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(join(DIR, 'doc.pdf'), pdf, 'latin1');
}

writeFileSync(
  join(DIR, 'unicode.txt'),
  'Ελληνικά · Русский · Tiếng Việt\n中文简体，繁體中文 · 日本語のテキスト · 한국어 텍스트\n',
);

// A page filled pure blue, to catch red/blue channel swaps in PDF → image.
{
  const content = '0 0 1 rg 0 0 100 100 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(join(DIR, 'blue.pdf'), pdf, 'latin1');
}

console.log('fixtures written to', DIR);
