// MediaRecorder is the only video encoder available without adding a dependency, and it
// only exists in a browser — so the WebM fixture gets recorded in Chrome and written to
// disk for the smoke run to feed back in. Includes an audio track so the extract-audio
// pair has something to pull out.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const DIR = join(process.cwd(), '.smoke-fixtures');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('about:blank');

const b64 = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const videoStream = canvas.captureStream(15);

  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const dest = audioCtx.createMediaStreamDestination();
  osc.frequency.value = 440;
  osc.connect(dest);
  osc.start();

  const stream = new MediaStream([...videoStream.getTracks(), ...dest.stream.getTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();

  let frame = 0;
  const timer = setInterval(() => {
    ctx.fillStyle = frame % 2 ? '#C8FF00' : '#FF4D00';
    ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = '#000';
    ctx.fillRect((frame * 8) % 128, 40, 16, 16);
    frame++;
  }, 66);

  await new Promise((r) => setTimeout(r, 1500));
  clearInterval(timer);
  osc.stop();
  await new Promise((r) => {
    rec.onstop = r;
    rec.stop();
  });

  const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
});

await browser.close();
const out = Buffer.from(b64, 'base64');
writeFileSync(join(DIR, 'clip.webm'), out);
console.log('clip.webm', out.length, 'bytes');
