import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { txtToEpub, mdToEpub, htmlToEpub, detectLanguage } from '@/lib/epub-converter';

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function read(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`missing ${path} (have ${Object.keys(zip.files).join(', ')})`);
  return entry.async('text');
}

function parsesAsXml(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
}

// A 1×1 transparent PNG.
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Inputs chosen to hit every rule epubcheck enforces that the old builder broke.
const SAMPLES: Record<string, () => Promise<Blob>> = {
  'plain.txt': () =>
    txtToEpub(
      new File(['Line one & <two>\nstill one\n\nParagraph two'], 'plain.txt'),
      'txt',
      'epub',
    ),
  'chapters.md': () =>
    mdToEpub(
      new File(
        [
          '# My Book\n\n## Chapter One\n\nHello<br>world & more. See [later](#chapter-two-anchor).\n\n' +
            `![pixel](${PNG_DATA_URI})\n\n![missing](pic.png)\n\n<div id="chapter-two-anchor"></div>\n\n` +
            '## Chapter Two\n\nBack to [the start](#chapter-one).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode <x>\n```\n\n[web](https://example.com) [file](other.html) [gone](#nowhere)',
        ],
        'book.md',
      ),
      'md',
      'epub',
    ),
  'messy.html': () =>
    htmlToEpub(
      new File(
        [
          '<!DOCTYPE html><html lang="fr"><head><title>Livre</title><style>p{}</style></head><body>' +
            '<main><h1 onclick="x()" data-x="1" align="center">Un</h1><center><font color="red">vieux</font></center>' +
            '<p>a<br>b &nbsp; c<img src="x.png"><img src="' +
            PNG_DATA_URI +
            '" alt="dot"></p><script>alert(1)</script><iframe src="x"></iframe>' +
            '<my-widget><p>custom</p></my-widget><p id="dup">1</p><p id="dup">2</p>' +
            '<form><input></form><h2>Deux</h2><table><tr><td colspan="2" bgcolor="red">t</td></tr></table>' +
            '</main></body></html>',
        ],
        'messy.html',
      ),
      'html',
      'epub',
    ),
  'japanese.md': () =>
    mdToEpub(
      new File(['# 吾輩は猫である\n\n名前はまだ無い。どこで生れたか。'], 'neko.md'),
      'md',
      'epub',
    ),
  'empty.txt': () => txtToEpub(new File([''], 'empty.txt'), 'txt', 'epub'),
};

describe('EPUB package structure', () => {
  it('stores mimetype first and uncompressed', async () => {
    const buf = new Uint8Array(await (await SAMPLES['plain.txt']()).arrayBuffer());
    // Local file header: name at offset 30, compression method at offset 8.
    expect(new TextDecoder().decode(buf.slice(30, 38))).toBe('mimetype');
    expect(buf[8] | (buf[9] << 8)).toBe(0);
  });

  it('has a nav document, an NCX, a timestamp with time, and well-formed XHTML', async () => {
    for (const make of Object.values(SAMPLES)) {
      const zip = await unzip(await make());
      const opf = await read(zip, 'OEBPS/content.opf');
      parsesAsXml(opf);
      expect(opf).toMatch(/properties="nav"/);
      expect(opf).toMatch(/dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ</);
      parsesAsXml(await read(zip, 'OEBPS/nav.xhtml'));
      parsesAsXml(await read(zip, 'OEBPS/toc.ncx'));
      for (const name of Object.keys(zip.files).filter((f) => f.endsWith('.xhtml'))) {
        const xhtml = await read(zip, name);
        parsesAsXml(xhtml);
        expect(xhtml).not.toMatch(/<!DOCTYPE|<script|<iframe|<style|onclick|<br>/i);
      }
    }
  });
});

describe('mdToEpub', () => {
  it('splits chapters on headings and merges a title-only heading into the next', async () => {
    const zip = await unzip(await SAMPLES['chapters.md']());
    const nav = await read(zip, 'OEBPS/nav.xhtml');
    expect(
      [...nav.matchAll(/<a href="(chapter-\d+\.xhtml)">([^<]+)</g)].map((m) => [m[1], m[2]]),
    ).toEqual([
      ['chapter-1.xhtml', 'Chapter One'],
      ['chapter-2.xhtml', 'Chapter Two'],
    ]);
    const one = await read(zip, 'OEBPS/chapter-1.xhtml');
    expect(one).toContain('<h1 id="my-book">My Book</h1>');
    expect(one).toContain('Hello<br />world &amp; more.');
  });

  it('packages data: images, keeps alt text for unreachable ones, fixes links', async () => {
    const zip = await unzip(await SAMPLES['chapters.md']());
    expect(zip.file('OEBPS/images/image-1.png')).not.toBeNull();
    const opf = await read(zip, 'OEBPS/content.opf');
    expect(opf).toContain('href="images/image-1.png" media-type="image/png"');
    const one = await read(zip, 'OEBPS/chapter-1.xhtml');
    expect(one).toContain('src="images/image-1.png"');
    expect(one).toContain('missing'); // alt text of pic.png
    expect(one).not.toContain('pic.png');
    // #fragment rewritten to the chapter that holds the id.
    expect(one).toContain('href="chapter-1.xhtml#chapter-two-anchor"');
    const two = await read(zip, 'OEBPS/chapter-2.xhtml');
    expect(two).toContain('href="https://example.com"');
    expect(two).not.toContain('other.html');
    expect(two).not.toContain('#nowhere');
    expect(two).toContain('code &lt;x&gt;');
    // Headings get GitHub-style ids, so [x](#chapter-one) finds its target.
    expect(one).toContain('<h2 id="chapter-one">Chapter One</h2>');
    expect(two).toContain('href="chapter-1.xhtml#chapter-one"');
  });
});

describe('htmlToEpub', () => {
  it('uses <title> and <html lang>, and strips what EPUB XHTML forbids', async () => {
    const zip = await unzip(await SAMPLES['messy.html']());
    const opf = await read(zip, 'OEBPS/content.opf');
    expect(opf).toContain('<dc:title>Livre</dc:title>');
    expect(opf).toContain('<dc:language>fr</dc:language>');
    const one = await read(zip, 'OEBPS/chapter-1.xhtml');
    expect(one).toContain('<h1 data-x="1" id="un">Un</h1>'); // onclick and align gone
    expect(one).toContain('<div><span>vieux</span></div>'); // center/font mapped
    expect(one).toContain('<div><p>custom</p></div>'); // unknown element
    expect(one.match(/id="dup"/g)).toHaveLength(1);
    expect(one).not.toMatch(/<form|<input/);
    const two = await read(zip, 'OEBPS/chapter-2.xhtml');
    expect(two).toContain('<td colspan="2">t</td>');
  });
});

describe('txtToEpub', () => {
  it('turns blank-line paragraphs into <p> and single newlines into <br/>', async () => {
    const zip = await unzip(await SAMPLES['plain.txt']());
    const one = await read(zip, 'OEBPS/chapter-1.xhtml');
    expect(one).toContain('<p>Line one &amp; &lt;two&gt;<br/>still one</p>');
    expect(one).toContain('<p>Paragraph two</p>');
    expect(await read(zip, 'OEBPS/content.opf')).toContain('<dc:title>plain</dc:title>');
  });
});

describe('detectLanguage', () => {
  it('prefers a declared tag, then the dominant script, else "und"', () => {
    expect(detectLanguage('anything', 'pt-BR')).toBe('pt-BR');
    expect(detectLanguage('吾輩は猫である。名前はまだ無い。')).toBe('ja');
    expect(detectLanguage('我们的书很好')).toBe('zh');
    expect(detectLanguage('한국어 문장입니다')).toBe('ko');
    expect(detectLanguage('Привет, мир')).toBe('ru');
    expect(detectLanguage('Hello world')).toBe('und');
    expect(detectLanguage('', 'not a tag!')).toBe('und');
  });
});

// The real validator. CI downloads epubcheck and sets EPUBCHECK_JAR, so every
// sample above is checked on each run; locally it runs when the jar is present.
const jar = process.env.EPUBCHECK_JAR;
describe.runIf(Boolean(jar))('W3C epubcheck', () => {
  it('reports no errors or warnings for any sample', { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'epubcheck-'));
    const failures: string[] = [];
    for (const [name, make] of Object.entries(SAMPLES)) {
      const path = join(dir, `${name}.epub`);
      writeFileSync(path, new Uint8Array(await (await make()).arrayBuffer()));
      try {
        execFileSync('java', ['-jar', jar!, path, '--quiet'], { stdio: 'pipe' });
      } catch (err) {
        const out =
          String((err as { stdout?: Buffer }).stdout ?? '') +
          String((err as { stderr?: Buffer }).stderr ?? '');
        failures.push(
          `${name}:\n${out
            .split('\n')
            .filter((l) => /^(ERROR|FATAL|WARNING)/.test(l))
            .join('\n')}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
