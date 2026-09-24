import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Missing keys fall back to English silently, so a new UI string shipped
// without translations goes unnoticed. This keeps every locale complete.
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const dir = join(__dirname, '..', '..', 'locales');
const load = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const english = new Set(flatten(load('en.json')));

describe('locales', () => {
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
    it(`${name} translates every English key`, () => {
      const keys = new Set(flatten(load(name)));
      expect([...english].filter((k) => !keys.has(k))).toEqual([]);
    });
  }
});
