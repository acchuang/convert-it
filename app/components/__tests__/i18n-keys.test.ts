// @vitest-environment node
// A missing translation shows the raw key ("job.presetBest") on screen, so:
// every locale has exactly the same keys, and every key the code asks for
// by name exists. Keys built at runtime (t(`job.stage.${stage}`)) are
// checked by their static prefix.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const LOCALES = readdirSync(join(root, 'locales')).filter((f) => f.endsWith('.json'));

function keys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}
const load = (file: string) => keys(JSON.parse(readFileSync(join(root, 'locales', file), 'utf8')));

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(join(root, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('locales', () => {
  const english = new Set(load('en.json'));

  it.each(LOCALES.filter((f) => f !== 'en.json'))('%s has exactly the English keys', (file) => {
    const theirs = new Set(load(file));
    expect([...english].filter((k) => !theirs.has(k))).toEqual([]);
    expect([...theirs].filter((k) => !english.has(k))).toEqual([]);
  });

  it('every key the code names exists', () => {
    const missing: string[] = [];
    let named = 0;
    for (const file of [...sources('app'), ...sources('lib')]) {
      const code = readFileSync(join(root, file), 'utf8');
      for (const [, key] of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        named++;
        if (!english.has(key)) missing.push(`${file}: ${key}`);
      }
      for (const [, prefix] of code.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\$\{/g)) {
        if (![...english].some((k) => k.startsWith(prefix))) missing.push(`${file}: ${prefix}…`);
      }
    }
    expect(missing).toEqual([]);
    expect(named).toBeGreaterThan(200); // the pattern still matches how the code calls t()
  });
});
