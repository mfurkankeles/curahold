// The self-hosted server's own parts: its settings, files on disk, and the
// company made on the first start (api/src/selfhost.ts).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { createMemoryPg, pgliteDb } from '../api/src/db/pglite';
import { DiskStorage, ensureCompany, selfHostConfig } from '../api/src/selfhost';

const SECRET = 'a-secret-that-is-long-enough-for-this-test';

describe('self-hosted settings', () => {
  it('takes the address people open, one company, no sign-up and no billing', () => {
    const cfg = selfHostConfig({ PUBLIC_URL: 'https://curahold.example.com', AUTH_SECRET: SECRET, COMPANY_SLUG: 'Acme', PADDLE_API_KEY: 'ignored' });
    expect(cfg.baseDomain).toBe('curahold.example.com');
    expect(cfg.centralHost).toBe('curahold.example.com');
    expect(cfg.scheme).toBe('https');
    expect(cfg.publicPort).toBeUndefined();
    expect(cfg.singleTenantSlug).toBe('acme');
    expect(cfg.signupEnabled).toBe(false);
    expect(cfg.billing).toBeUndefined();
  });

  it('keeps a plain-http address and its port (a trial on a laptop)', () => {
    const cfg = selfHostConfig({ PUBLIC_URL: 'http://localhost:8080', AUTH_SECRET: SECRET });
    expect(cfg.scheme).toBe('http');
    expect(cfg.publicPort).toBe(8080);
    expect(cfg.singleTenantSlug).toBe('company');
  });

  it('says what is missing', () => {
    expect(() => selfHostConfig({ AUTH_SECRET: SECRET })).toThrow(/PUBLIC_URL/);
    expect(() => selfHostConfig({ PUBLIC_URL: 'https://x.example.com', AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
});

describe('attachments on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'curahold-files-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const storage = new DiskStorage(dir);

  it('keeps a file with its type, gives it back and deletes it', async () => {
    const key = 'org-1/task-1/file-1';
    await storage.put(key, new TextEncoder().encode('hello').buffer as ArrayBuffer, 'text/plain');
    const back = await storage.get(key);
    expect(back?.mime).toBe('text/plain');
    expect(new TextDecoder().decode(back!.data)).toBe('hello');
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it('refuses a key that would leave its folder', async () => {
    for (const key of ['../escape', 'a/../../b', '/etc/passwd', 'a//b', '']) {
      await expect(storage.put(key, new ArrayBuffer(1), 'text/plain')).rejects.toThrow(/bad file key/);
    }
  });
});

describe('the first start', () => {
  it('makes the company and its administrator once, then leaves them be', async () => {
    const db = pgliteDb(await createMemoryPg());
    await migrate(db, loadMigrations());
    await expect(ensureCompany(db, {}, 'acme')).rejects.toThrow(/ADMIN_EMAIL/);
    const env = { ADMIN_EMAIL: 'Owner@Acme.example', ADMIN_NAME: 'Olga Owner', COMPANY_NAME: 'Acme', LOCALE: 'tr', CURRENCY: 'TRY' };
    expect(await ensureCompany(db, env, 'acme')).toBe('created');
    expect(await ensureCompany(db, env, 'acme')).toBe('there');
    const [org] = await db.system((q) => q.query(`select name, locale from orgs where slug = 'acme'`));
    expect(org).toMatchObject({ name: 'Acme', locale: 'tr' });
    const users = await db.system((q) => q.query(`select email, name, status from users`));
    expect(users).toEqual([{ email: 'owner@acme.example', name: 'Olga Owner', status: 'active' }]);
  });
});
