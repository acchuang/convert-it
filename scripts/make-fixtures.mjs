// Builds the smoke-test fixtures. node-canvas is already a devDependency (vitest uses
// it for the image converters), so the PNG comes from that rather than a hand-rolled
// encoder. The WebM has to come from a real browser — MediaRecorder is the only encoder
// available without adding a dependency — so playwright writes it in a separate pass.
import { mkdirSync, writeFileSync } from 'node:fs';
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
  JSON.stringify([{ name: 'widget', qty: 3 }, { name: 'gadget', qty: 12 }], null, 2)
);
writeFileSync(join(DIR, 'doc.md'), '# Title\n\nSome **bold** text and a [link](https://example.com).\n');
writeFileSync(join(DIR, 'doc.txt'), 'Plain text line one.\nPlain text line two.\n');

console.log('fixtures written to', DIR);
