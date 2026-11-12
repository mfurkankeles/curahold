// The developer reference is built from the API's own code. These tests keep
// it complete: every address is either described in the catalogue or listed
// as internal, nothing described has disappeared, and the pages kept in the
// repository are the ones the code gives today.
//
// To fix a failure: add a sentence in scripts/docs/catalogue.ts (both
// languages), then run `npx tsx scripts/docs/api-reference.ts`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, pages } from '../scripts/docs/api-reference';
import { GROUPS } from '../scripts/docs/catalogue';
import { readRoutes } from '../scripts/docs/routes';

const routes = readRoutes();

describe('the developer reference', () => {
  it('finds the addresses the server really has', () => {
    expect(routes.filter((r) => r.api).length).toBeGreaterThan(200);
    const patch = routes.find((r) => r.method === 'PATCH' && r.path === '/tasks/:id')!;
    expect(patch.writer).toBe(true);
    expect(patch.body.find((f) => f.name === 'baseVersion')).toMatchObject({ type: 'whole number', required: true });
    expect(patch.body.find((f) => f.name === 'dueDate')?.required).toBe(false);
    const list = routes.find((r) => r.method === 'GET' && r.path === '/accounts')!;
    expect(list.query).toEqual(expect.arrayContaining(['q', 'owner', 'limit', 'offset']));
    expect(routes.find((r) => r.path === '/admin/users' && r.method === 'GET')?.perms).toContain('users.manage');
  });

  it('describes every open address, in both languages, and nothing that is gone', () => {
    expect(check(routes)).toEqual({ undocumented: [], stale: [] });
    for (const g of GROUPS) for (const [key, en, tr] of g.routes) expect(en.length > 5 && tr.length > 5, key).toBe(true);
  });

  it('keeps the pages in the repository in step with the code', () => {
    const stale = pages(routes)
      .filter((p) => readFileSync(join('docs', 'site', p.lang, p.file), 'utf8') !== p.content)
      .map((p) => `${p.lang}/${p.file}`);
    expect(stale, 'run: npx tsx scripts/docs/api-reference.ts').toEqual([]);
  });

  it('has every page in both languages, and no link between pages that leads nowhere', () => {
    const files = (lang: string) => readdirSync(join('docs', 'site', lang)).filter((f) => f.endsWith('.md')).sort();
    expect(files('tr')).toEqual(files('en'));
    const broken: string[] = [];
    for (const lang of ['en', 'tr']) {
      const have = new Set(files(lang).map((f) => f.replace(/\.md$/, '')));
      for (const f of files(lang)) {
        const md = readFileSync(join('docs', 'site', lang, f), 'utf8');
        for (const m of md.matchAll(/\]\(\/docs\/(en|tr)\/([a-z0-9-]+)\/(?:#[^)]*)?\)/g)) {
          if (m[1] !== lang) broken.push(`${lang}/${f}: links to the other language (${m[0]})`);
          else if (!have.has(m[2])) broken.push(`${lang}/${f}: ${m[2]} does not exist`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
