// One conversion pair per engine, driven through the real UI in a real browser.
// Verifies the downloaded bytes, not just that the button turned green — a converter
// that emits an empty or wrong-typed blob still reaches the "done" state.
//
//   node scripts/smoke.mjs            # Chrome
//   node scripts/smoke.mjs webkit     # Safari engine
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';

const APP = process.env.SMOKE_URL ?? 'http://localhost:3000';
const DIR = join(process.cwd(), '.smoke-fixtures');
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chrome';

// [fixture, target format, engine under test, validator]
const isText = (b) => b.length > 0 && !b.subarray(0, 512).includes(0);
const magic =
  (sig, off = 0) =>
  (b) =>
    b.subarray(off, off + sig.length).toString('latin1') === sig;

const PAIRS = [
  ['img.png', 'webp', 'libwebp', (b) => magic('RIFF')(b) && magic('WEBP', 8)(b)],
  ['img.png', 'jpg', 'mozjpeg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['img.svg', 'png', 'resvg + oxipng', magic('\x89PNG')],
  ['doc.pdf', 'png', 'pdfium', magic('\x89PNG')],
  ['clip.mkv', 'webm', 'ffmpeg vp8+vorbis', (b) => b.readUInt32BE(0) === 0x1a45dfa3],
  ['clip.webm', 'mp4', 'ffmpeg video', magic('ftyp', 4)],
  [
    'audio.wav',
    'mp3',
    'ffmpeg audio',
    (b) => magic('ID3')(b) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ],
  [
    'clip.webm',
    'mp3',
    'ffmpeg extract',
    (b) => magic('ID3')(b) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ],
  ['data.csv', 'json', 'data', (b) => JSON.parse(b.toString()).length === 2],
  ['data.csv', 'xlsx', 'xlsx writer', magic('PK')],
  ['data.json', 'yaml', 'yaml', (b) => b.toString().includes('name:')],
  ['doc.md', 'html', 'document', (b) => /<(h1|strong|a)\b/i.test(b.toString())],
  ['doc.txt', 'pdf', 'jspdf (worker)', magic('%PDF')],
  ['data.json', 'pdf', 'jspdf json (worker)', magic('%PDF')],
  ['doc.md', 'pdf', 'jspdf md (main)', magic('%PDF')],
  [
    'doc.md',
    'epub',
    'epub (main)',
    (b) => magic('PK')(b) && magic('mimetypeapplication/epub+zip', 30)(b),
  ],
  ['data.xml', 'csv', 'xml (worker)', (b) => b.toString() === '@id,title\r\n1,Dune\r\n2,Ubik'],
];

// Google Chrome by default (what CI runners have); SMOKE_CHROMIUM_PATH points
// at any other Chromium build, e.g. Playwright's own when Chrome isn't installed.
const chromeLaunch = process.env.SMOKE_CHROMIUM_PATH
  ? { executablePath: process.env.SMOKE_CHROMIUM_PATH }
  : { channel: 'chrome' };
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch(chromeLaunch));

const results = [];

for (const [fixture, target, label, check] of PAIRS) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // Any CSP violation fails the pair, even if the conversion still succeeded:
  // it means the policy and the app have drifted apart.
  const cspViolations = [];
  await page.exposeFunction('__reportCsp', (v) => cspViolations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__reportCsp(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}`),
    );
  });
  const watchCsp = (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text().slice(0, 200));
  };
  page.on('console', watchCsp);
  // Workers take their CSP from response headers and report violations in their
  // own console, which the page's listener never sees.
  page.on('worker', (worker) => worker.on('console', watchCsp));

  const row = { pair: `${fixture.split('.').pop()} → ${target}`, label, ok: false, note: '' };

  try {
    // Not domcontentloaded: the file input is in the static HTML, so setInputFiles
    // succeeds before hydration wires up onChange and the drop is silently lost.
    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.setInputFiles('input[type="file"]', join(DIR, fixture));
    await page.waitForSelector('[role="listitem"]', { timeout: 15000 });

    const select = page.locator('select[aria-label="Target format"]').first();
    const options = await select.locator('option').evaluateAll((els) => els.map((e) => e.value));
    if (!options.includes(target)) {
      row.note = `target not offered (has: ${options.join(',')})`;
      results.push(row);
      await page.close();
      continue;
    }
    await select.selectOption(target);

    await page.locator(`button[aria-label^="CONVERT →"]`).first().click();

    const done = page.locator('button[aria-label="DOWNLOAD"]').first();
    const failed = page.locator('button[aria-label="RETRY"]').first();
    await Promise.race([
      done.waitFor({ state: 'visible', timeout: 240000 }),
      failed.waitFor({ state: 'visible', timeout: 240000 }),
    ]);

    if (await failed.isVisible()) {
      row.note =
        (await page
          .locator('p.text-\\[var\\(--error\\)\\]')
          .first()
          .textContent()
          .catch(() => null)) ??
        consoleErrors[0] ??
        'conversion errored';
      results.push(row);
      await page.close();
      continue;
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      done.click(),
    ]);
    const bytes = readFileSync(await download.path());
    // SMOKE_SAVE_DIR keeps each output, e.g. to run epubcheck on what a real
    // browser produced.
    if (process.env.SMOKE_SAVE_DIR) {
      writeFileSync(join(process.env.SMOKE_SAVE_DIR, download.suggestedFilename()), bytes);
    }

    if (cspViolations.length) row.note = `CSP: ${cspViolations[0]}`;
    else if (bytes.length === 0) row.note = 'empty output';
    else if (!check(bytes))
      row.note = `bad signature (${bytes.length}B, starts ${bytes.subarray(0, 8).toString('hex')})`;
    else {
      row.ok = true;
      row.note = `${bytes.length}B → ${download.suggestedFilename()}`;
    }
  } catch (err) {
    row.note = `${err.message.split('\n')[0]}${consoleErrors.length ? ` | ${consoleErrors[0]}` : ''}`;
  }

  results.push(row);
  await page.close();
}

await browser.close();

console.log(`\n=== ${engine} ===`);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.pair.padEnd(14)} ${r.label.padEnd(16)} ${r.note}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
