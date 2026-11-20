// A fetch whose answer is never read keeps its connection open until the browser gives up on it, and a page
// holds only a few per host. The static docs files (search.json, answers.json) are fetched once per language and
// a language without them answers 404: each such loader must cancel the unread body on that branch (review
// 20 Nov; the same class as the early-answer fix in web/src/lib/api.ts). This reads the sources, so a new loader
// of a docs file is held to the same rule.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(import.meta.dirname, '..', 'web', 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe('static docs files', () => {
  it('every loader cancels the body of a failed answer instead of leaving it unread', () => {
    const loaders: string[] = [];
    const bad: string[] = [];
    for (const f of files(WEB)) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('fetch(docsFile(')) return;
        const where = `${f.slice(WEB.length + 1)}:${i + 1}`;
        loaders.push(where);
        if (!lines.slice(i, i + 8).some((l) => l.includes('body?.cancel('))) bad.push(where);
      });
    }
    expect(loaders.length).toBeGreaterThanOrEqual(3);
    expect(bad).toEqual([]);
  });
});
