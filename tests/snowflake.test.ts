// Snowflake as a source, against a stub of the SQL API: the key-pair sign-in (a
// signed JWT whose issuer names the public-key fingerprint), what is accepted as
// a query, the columns it offers, how rows and partitions are read, and that
// nothing is ever written back. Mirrors tests/bigquery.test.ts.
import { describe, expect, it } from 'vitest';
import { keyFingerprint, qualifiedName, snowflake, snowflakeHost, statement } from '../api/src/sync/adapters/snowflake';
import { CrmError, type CrmCtx } from '../api/src/sync/adapters/types';

const NOW = new Date('2026-11-14T10:00:00Z');
const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString('base64');
const fromB64url = (s: string) => Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

async function keyPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { pem, pair };
}

const SCHEMA = [
  { name: 'CUSTOMER_ID', type: 'TEXT' },
  { name: 'CONTACT_EMAIL', type: 'TEXT' },
  { name: 'HEALTH_SCORE', type: 'REAL' },
  { name: 'SEATS', type: 'FIXED' },
  { name: 'ACTIVE', type: 'BOOLEAN' },
  { name: 'UPDATED_AT', type: 'TIMESTAMP_NTZ' },
  { name: 'TAGS', type: 'ARRAY' },
];

function warehouse(pair: CryptoKeyPair) {
  const calls: { method: string; url: string; body: any; auth: string | null; tokenType: string | null }[] = [];
  const jwts: { head: any; claims: any; valid: boolean }[] = [];
  const fetcher = (async (u: string, init: RequestInit = {}) => {
    const url = String(u);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const auth = headers.get('authorization');
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null, auth, tokenType: headers.get('x-snowflake-authorization-token-type') });
    // Every real connection carries the key-pair JWT as the bearer; verify its signature.
    if (auth?.startsWith('Bearer ') && auth.slice(7).split('.').length === 3) {
      const [h, c, sig] = auth.slice(7).split('.');
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
      jwts.push({ head: JSON.parse(Buffer.from(h, 'base64url').toString()), claims: JSON.parse(Buffer.from(c, 'base64url').toString()), valid });
    }
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (method === 'POST' && /\/api\/v2\/statements\?/.test(url)) {
      // A "LIMIT 0" statement is the schema probe; anything else reads rows.
      if (/LIMIT 0/.test(body.statement)) return Response.json({ resultSetMetaData: { rowType: SCHEMA, partitionInfo: [{ rowCount: 0 }] }, data: [], statementHandle: 'h0' });
      return Response.json({
        resultSetMetaData: { rowType: SCHEMA, partitionInfo: [{ rowCount: 2 }, { rowCount: 1 }] },
        statementHandle: 'h1',
        data: [
          ['C-1', 'ops@quillfield.example', '71.5', '40', 'true', '1762500000.000000000', null],
          ['', 'x@y.example', '1', '1', 'false', '1762500000.000000000', null],
        ],
      });
    }
    if (method === 'GET' && /\/api\/v2\/statements\/h1\?partition=1/.test(url)) {
      return Response.json({ resultSetMetaData: { rowType: SCHEMA, partitionInfo: [{ rowCount: 2 }, { rowCount: 1 }] }, statementHandle: 'h1', data: [['C-2', null, '12', '3', 'false', '1762600000.000000000', null]] });
    }
    return new Response('no route', { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls, jwts };
}

const CONFIG = { account: 'ab12345.eu-west-1', user: 'CURAHOLD_READER', query: 'SELECT * FROM analytics.crm.health', idColumn: 'CUSTOMER_ID', modifiedColumn: 'UPDATED_AT', name: 'health' };
const ctxOf = (fetcher: typeof fetch, config: Record<string, any>): CrmCtx => ({ fetch: fetcher, now: () => NOW, config, token: async () => 'tok-1', refresh: async () => 'tok-2' });

describe('Snowflake', () => {
  it('builds the host and the qualified name, and rejects a bad account', () => {
    expect(snowflakeHost('ab12345.eu-west-1')).toBe('https://ab12345.eu-west-1.snowflakecomputing.com');
    expect(snowflakeHost('https://AB12345.snowflakecomputing.com/')).toBe('https://ab12345.snowflakecomputing.com');
    expect(snowflakeHost('my_org-acct')).toBe('https://my-org-acct.snowflakecomputing.com');
    expect(qualifiedName('ab12345.eu-west-1', 'reader')).toBe('AB12345.READER');
    expect(() => snowflakeHost('')).toThrow(CrmError);
  });

  it('wraps the query to read only what changed, with the moment bound as a parameter', () => {
    expect(statement(CONFIG, null).sql).toBe('SELECT * FROM (SELECT * FROM analytics.crm.health) AS curahold_q ORDER BY UPDATED_AT ASC');
    const s = statement(CONFIG, '2026-11-10T00:00:00.000Z');
    expect(s.sql).toContain('WHERE UPDATED_AT >= ?');
    expect(s.bindings).toEqual({ '1': { type: 'TEXT', value: '2026-11-10T00:00:00.000Z' } });
    // Without a modified column every run reads the whole result.
    expect(statement({ ...CONFIG, modifiedColumn: null }, '2026-11-10T00:00:00.000Z')).toEqual({ sql: 'SELECT * FROM analytics.crm.health', bindings: undefined });
    expect(() => statement({ ...CONFIG, modifiedColumn: 'x"; DROP' }, null)).toThrow(/plain column/);
    expect(() => statement({ ...CONFIG, query: 'DELETE FROM t WHERE true' }, null)).toThrow(/SELECT or WITH/);
  });

  it('derives the public-key fingerprint from the private key', async () => {
    const { pem } = await keyPair();
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
    const fp = await keyFingerprint(key);
    expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]{43}=$/);
  });

  it('signs in with the key, checks the query and its columns, and never trusts a column that is not there', async () => {
    const { pem, pair } = await keyPair();
    const w = warehouse(pair);
    const values = { account: 'ab12345.eu-west-1', user: 'CURAHOLD_READER', privateKey: pem, name: 'Customer Health', query: CONFIG.query, idColumn: 'CUSTOMER_ID', modifiedColumn: 'UPDATED_AT' };
    const made = await snowflake.keyed!.connect(w.fetcher, values, NOW);
    expect(made.instanceId).toBe('AB12345.CURAHOLD_READER:customer-health');
    expect(made.label).toBe('Snowflake · customer-health');
    expect(made.config).toMatchObject({ account: 'ab12345.eu-west-1', user: 'CURAHOLD_READER', idColumn: 'CUSTOMER_ID', modifiedColumn: 'UPDATED_AT' });
    expect(made.secret).toMatchObject({ account: 'ab12345.eu-west-1', user: 'CURAHOLD_READER', expiresAt: NOW.getTime() + 59 * 60_000 });
    // The JWT is the bearer, verified, with the token-type header, and its subject is the qualified user.
    expect(w.jwts.length).toBeGreaterThan(0);
    expect(w.jwts.every((j) => j.valid)).toBe(true);
    expect(w.jwts[0]).toMatchObject({ head: { alg: 'RS256' }, claims: { sub: 'AB12345.CURAHOLD_READER' } });
    expect(w.jwts[0].claims.iss).toMatch(/^AB12345\.CURAHOLD_READER\.SHA256:/);
    expect(w.calls.find((c) => c.method === 'POST')!.tokenType).toBe('KEYPAIR_JWT');
    // The schema probe is a LIMIT 0: no rows read.
    expect(w.calls.some((c) => /LIMIT 0/.test(c.body?.statement ?? ''))).toBe(true);
    await expect(snowflake.keyed!.connect(w.fetcher, { ...values, idColumn: 'NOPE' }, NOW)).rejects.toThrow(/no column called "NOPE"/);
    await expect(snowflake.keyed!.connect(w.fetcher, { ...values, query: 'UPDATE t SET a = 1 WHERE true' }, NOW)).rejects.toBeInstanceOf(CrmError);
  });

  it('offers the query as one object with its columns; arrays and records are left out', async () => {
    const { pair } = await keyPair();
    const ctx = ctxOf(warehouse(pair).fetcher, CONFIG);
    expect(await snowflake.objects(ctx)).toEqual([{ name: 'query', label: 'health', labelPlural: 'health', custom: true, hint: null }]);
    const fields = await snowflake.fields(ctx, 'query');
    expect(fields.map((f) => `${f.name}:${f.type}`)).toEqual(['CUSTOMER_ID:id', 'CONTACT_EMAIL:email', 'HEALTH_SCORE:number', 'SEATS:number', 'ACTIVE:bool', 'UPDATED_AT:datetime']);
    expect(fields.every((f) => !f.updatable)).toBe(true);
    expect(await snowflake.users(ctx)).toEqual([]);
  });

  it('reads rows with real types, skips rows without an id, and pages through the partitions', async () => {
    const { pair } = await keyPair();
    const w = warehouse(pair);
    const ctx = ctxOf(w.fetcher, CONFIG);
    const first = await snowflake.list(ctx, 'query', { since: '2026-11-10T00:00:00.000Z', cursor: null, fields: [] });
    expect(first.rows).toEqual([
      { id: 'C-1', modifiedAt: '2025-11-07T07:20:00.000Z', values: { CUSTOMER_ID: 'C-1', CONTACT_EMAIL: 'ops@quillfield.example', HEALTH_SCORE: 71.5, SEATS: 40, ACTIVE: true, UPDATED_AT: '2025-11-07T07:20:00.000Z' } },
    ]);
    expect(first.next).toBe('h1|1');
    const sent = w.calls.find((c) => c.method === 'POST' && !/LIMIT 0/.test(c.body?.statement ?? ''))!;
    expect(sent.body.statement).toContain('WHERE UPDATED_AT >= ?');
    expect(sent.body.bindings).toEqual({ '1': { type: 'TEXT', value: '2026-11-10T00:00:00.000Z' } });
    const second = await snowflake.list(ctx, 'query', { since: null, cursor: first.next, fields: [] });
    expect(second.rows.map((r) => r.id)).toEqual(['C-2']);
    expect(second.rows[0].values.CONTACT_EMAIL).toBeNull();
    expect(second.next).toBeNull();
    expect(w.calls.at(-1)!.url).toContain('/api/v2/statements/h1?partition=1');
  });

  it('renews its token from the key in the secret, and says to reconnect without one', async () => {
    const { pem, pair } = await keyPair();
    const w = warehouse(pair);
    const next = await snowflake.refresh({ fetch: w.fetcher, now: () => NOW, config: CONFIG }, { account: 'ab12345.eu-west-1', user: 'CURAHOLD_READER', privateKey: pem }, { clientId: '', clientSecret: '' });
    expect(next.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    await expect(snowflake.refresh({ fetch: w.fetcher, now: () => NOW, config: CONFIG }, {}, { clientId: '', clientSecret: '' })).rejects.toMatchObject({ auth: true });
  });

  it('is read only', async () => {
    const ctx = ctxOf(warehouse((await keyPair()).pair).fetcher, CONFIG);
    expect(snowflake.readOnly).toBe(true);
    await expect(snowflake.update(ctx, 'query', 'C-1', {}, [])).rejects.toThrow(/only read/);
    await expect(snowflake.create(ctx, 'query', {}, [])).rejects.toThrow(/only read/);
    expect(snowflake.url({}, 'query', 'C-1')).toBeNull();
  });
});
