import { CONVERSION_MAP, getFormatInfo } from './converters';
import type { FileCategory } from './types';

export interface Pair {
  from: string;
  to: string;
  slug: string;
}

/**
 * Every conversion worth a landing page, derived from the same map the app
 * runs on — so a converter added to the registry gets a page and a sitemap
 * entry without anyone remembering to write one.
 *
 * Skipped: extensions with no FORMATS entry (the `jpeg` alias, which would
 * only duplicate the `jpg` pages) and same-format pairs like jpg→jpg, which
 * are a re-encode knob rather than something anybody searches for.
 */
export function allPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const [from, targets] of Object.entries(CONVERSION_MAP)) {
    if (!getFormatInfo(from)) continue;
    for (const to of targets) {
      if (to === from || !getFormatInfo(to)) continue;
      pairs.push({ from, to, slug: `${from}-to-${to}` });
    }
  }
  return pairs;
}

export function parsePair(slug: string): Pair | null {
  const [from, to] = slug.split('-to-');
  if (!from || !to) return null;
  if (!getTargets(from).includes(to)) return null;
  return { from, to, slug };
}

function getTargets(ext: string): string[] {
  return CONVERSION_MAP[ext] ?? [];
}

const NOUN: Record<FileCategory, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio file',
  document: 'document',
  data: 'data file',
};

const ENGINE: Record<FileCategory, string> = {
  image: 'jSquash WASM codecs (with oxipng for lossless PNG)',
  video: 'FFmpeg compiled to WebAssembly',
  audio: 'FFmpeg compiled to WebAssembly',
  document: 'WebAssembly document tooling',
  data: 'a streaming parser',
};

export interface PairCopy {
  fromLabel: string;
  toLabel: string;
  title: string;
  heading: string;
  description: string;
  engine: string;
  faq: { q: string; a: string }[];
}

// FORMATS labels the format; searchers type the extension. They only diverge
// where the label is the pedantic name, so override just those.
const SEO_LABEL: Record<string, string> = { jpg: 'JPG' };

function seoLabel(ext: string): string {
  return SEO_LABEL[ext] ?? getFormatInfo(ext)!.label;
}

export function pairCopy(pair: Pair): PairCopy {
  const from = { ...getFormatInfo(pair.from)!, label: seoLabel(pair.from) };
  const to = { ...getFormatInfo(pair.to)!, label: seoLabel(pair.to) };
  const noun = NOUN[from.category];
  const engine = ENGINE[from.category];
  const crossCategory = from.category !== to.category;
  const action = crossCategory
    ? `Extract ${to.label} from your ${from.label} ${noun}s`
    : `Convert ${from.label} ${noun}s to ${to.label}`;

  return {
    fromLabel: from.label,
    toLabel: to.label,
    title: `${from.label} to ${to.label} Converter — Free, Private, No Upload`,
    heading: `${from.label} to ${to.label}`,
    description: `${action} for free. Conversion runs entirely in your browser — your files are never uploaded, there is no account, and there is no daily quota.`,
    engine,
    faq: [
      {
        q: `Are my ${from.label} files uploaded anywhere?`,
        a: `No. Convert-it converts ${from.label} to ${to.label} on your own device using ${engine}. The only network requests are the app itself and, for video and audio, a one-time engine download.`,
      },
      {
        q: `Is the ${from.label} to ${to.label} converter free?`,
        a: 'Yes. There is no account, no watermark, no daily conversion limit and no paid tier. The project is open source.',
      },
      {
        q: `How large a ${from.label} file can I convert?`,
        a: `The limit is your device's memory rather than a server plan. Convert-it caps ${NOUN[from.category]}s conservatively so a huge file fails with a message instead of killing the tab.`,
      },
    ],
  };
}
