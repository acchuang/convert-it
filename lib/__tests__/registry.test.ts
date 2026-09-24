import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  allRoutes,
  CONVERSION_MAP,
  FORMATS,
  SETTING_FIELDS,
  type SettingKey,
} from '@/lib/converters';
import { buildFfmpegArgs } from '@/lib/audio-video-converters';
import { DEFAULT_SETTINGS, type ConversionSettings } from '@/lib/types';

const known = new Set([...FORMATS.map((f) => f.ext), 'jpeg']);

describe('converter registry', () => {
  it('only routes between known formats', () => {
    for (const r of allRoutes()) {
      expect(known.has(r.from), r.from).toBe(true);
      expect(known.has(r.to), r.to).toBe(true);
    }
  });

  it('targets per source, in order (the first is the default choice)', () => {
    expect(CONVERSION_MAP).toMatchSnapshot();
  });

  it('runs on the main thread only for ffmpeg and DOM-bound converters', () => {
    const category = (ext: string) => FORMATS.find((f) => f.ext === ext)?.category;
    for (const r of allRoutes()) {
      const media = category(r.from) === 'video' || category(r.from) === 'audio';
      const dom = r.from === 'html' || (r.from === 'md' && r.to === 'epub');
      expect(r.thread, `${r.from}→${r.to}`).toBe(media || dom ? 'main' : 'worker');
    }
  });
});

// A settings object that records which fields a converter reads.
function recording(): { settings: ConversionSettings; read: Set<string> } {
  const read = new Set<string>();
  const settings = new Proxy(
    { ...DEFAULT_SETTINGS },
    {
      get(target, key) {
        if (typeof key === 'string') read.add(key);
        return target[key as keyof ConversionSettings];
      },
    },
  );
  return { settings, read };
}

const SAMPLES: Record<string, () => File> = {
  csv: () => new File(['a,b\n1,2\n'], 's.csv'),
  tsv: () => new File(['a\tb\n1\t2\n'], 's.tsv'),
  json: () => new File(['[{"a":1,"b":2}]'], 's.json'),
  xml: () => new File(['<r><row><a>1</a></row><row><a>2</a></row></r>'], 's.xml'),
  yaml: () => new File(['- a: 1\n  b: 2\n'], 's.yaml'),
  md: () => new File(['# T\n\ntext'], 's.md'),
  html: () => new File(['<p>t</p>'], 's.html'),
  txt: () => new File(['t'], 's.txt'),
  xlsx: () => new File([readFileSync(join(__dirname, 'fixtures', 'sheetjs-types.xlsx'))], 's.xlsx'),
};

// Declared settings must be exactly what the converter reads: no hidden
// knobs, and no controls in the panel that do nothing.
describe('declared settings match what data and document converters read', () => {
  const routes = allRoutes().filter((r) => SAMPLES[r.from] && r.to !== 'epub');
  it.each(routes.map((r) => [`${r.from} → ${r.to}`, r] as const))('%s', async (_name, route) => {
    const { settings, read } = recording();
    await route.run(SAMPLES[route.from](), route.from, route.to, settings);
    const declared = new Set(route.settings.flatMap((k: SettingKey) => SETTING_FIELDS[k]));
    expect([...read].sort()).toEqual([...declared].sort());
  });
});

describe('declared settings match the ffmpeg command line', () => {
  const media = allRoutes().filter((r) => r.thread === 'main' && !['html', 'md'].includes(r.from));
  it.each(media.map((r) => [`${r.from} → ${r.to}`, r] as const))('%s', (_name, route) => {
    const args = buildFfmpegArgs(route.from, route.to, 'in', 'out', DEFAULT_SETTINGS);
    expect(route.settings.includes('audioBitrate')).toBe(args.includes('-b:a'));
    expect(route.settings.includes('video')).toBe(
      args.includes('-crf') || (args.includes('-q:v') && route.to !== 'webp'),
    );
  });
});
