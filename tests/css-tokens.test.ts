// A design token defined as itself (`--tint: var(--tint)`) is invalid when computed, so every use of it silently
// falls back to nothing: hover washes and the read-only warning colour disappeared that way (Package B note).
// This reads every stylesheet of the app and fails on any custom property whose value refers back to itself.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', 'web', 'src');
const sheets = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sheets(p) : f.endsWith('.css') ? [p] : [];
  });

describe('design tokens', () => {
  it('no custom property is defined in terms of itself', () => {
    const bad: string[] = [];
    for (const file of sheets(ROOT)) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]*)/g)) {
        if (new RegExp(`var\\(\\s*${m[1]}\\s*[,)]`).test(m[2])) bad.push(`${file.slice(ROOT.length + 1)}: ${m[1]}: ${m[2].trim()}`);
      }
    }
    expect(bad.join('\n')).toBe('');
  });
});
