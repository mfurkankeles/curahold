// Google BigQuery as a source, against a stub of Google's token and query
// APIs: the service-account sign-in (a signed assertion), what is accepted as
// a query, the columns it offers, how rows and pages are read, and that
// nothing is ever written back.
import { describe, expect, it } from 'vitest';
import { bigquery, checkQuery, parseServiceAccount, statement } from '../api/src/sync/adapters/bigquery';
import { CrmError, type CrmCtx } from '../api/src/sync/adapters/types';

const NOW = new Date('2026-11-11T10:00:00Z');
const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString('base64');
const fromB64url = (s: string) => Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

async function serviceAccount() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  const file = JSON.stringify({ type: 'service_account', project_id: 'acme-data-1', client_email: 'curahold@acme-data-1.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://evil.example/token' });
  return { file, pair };
}

const SCHEMA = [
  { name: 'customer_id', type: 'STRING' },
  { name: 'contact_email', type: 'STRING' },
  { name: 'health_score', type: 'FLOAT' },
  { name: 'seats', type: 'INTEGER' },
  { name: 'active', type: 'BOOLEAN' },
  { name: 'updated_at', type: 'TIMESTAMP' },
  { name: 'tags', type: 'STRING', mode: 'REPEATED' },
  { name: 'owner', type: 'RECORD' },
];

function warehouse(pair: CryptoKeyPair) {
  const calls: { method: string; url: string; body: any; auth: string | null }[] = [];
  const asserted: { head: any; claims: any; valid: boolean }[] = [];
  let tokens = 0;
  const fetcher = (async (u: string, init: RequestInit = {}) => {
    const url = String(u);
    const method = init.method ?? 'GET';
    const isForm = init.body instanceof URLSearchParams;
    calls.push({ method, url, body: init.body && !isForm ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get('authorization') });
    if (url === 'https://oauth2.googleapis.com/token') {
      const [h, c, sig] = (init.body as URLSearchParams).get('assertion')!.split('.');
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
      asserted.push({ head: JSON.parse(Buffer.from(h, 'base64url').toString()), claims: JSON.parse(Buffer.from(c, 'base64url').toString()), valid });
      return Response.json({ access_token: `tok-${++tokens}`, expires_in: 3600 });
    }
    if (method === 'POST' && /\/projects\/acme-data-1\/queries$/.test(url)) {
      const b = JSON.parse(String(init.body));
      if (b.dryRun) return Response.json({ jobComplete: true, schema: { fields: SCHEMA }, totalBytesProcessed: '1024' });
      return Response.json({
        jobComplete: true,
        jobReference: { jobId: 'job_1', location: 'EU' },
        schema: { fields: SCHEMA },
        rows: [
          { f: [{ v: 'C-1' }, { v: 'ops@quillfield.example' }, { v: '71.5' }, { v: '40' }, { v: 'true' }, { v: '1.7625E9' }, { v: null }, { v: null }] },
          { f: [{ v: '' }, { v: 'x@y.example' }, { v: '1' }, { v: '1' }, { v: 'false' }, { v: '1.7625E9' }, { v: null }, { v: null }] },
        ],
        pageToken: 'next-1',
      });
    }
    if (method === 'GET' && /\/queries\/job_1\?/.test(url)) {
      return Response.json({ jobComplete: true, jobReference: { jobId: 'job_1', location: 'EU' }, schema: { fields: SCHEMA }, rows: [{ f: [{ v: 'C-2' }, { v: null }, { v: '12' }, { v: '3' }, { v: 'false' }, { v: '1.7626E9' }, { v: null }, { v: null }] }] });
    }
    return new Response('no route', { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls, asserted };
}

const ctxOf = (fetcher: typeof fetch, config: Record<string, any>): CrmCtx => ({ fetch: fetcher, now: () => NOW, config, token: async () => 'tok-1', refresh: async () => 'tok-2' });
const CONFIG = { projectId: 'acme-data-1', query: 'SELECT * FROM `acme-data-1.crm.health`', idColumn: 'customer_id', modifiedColumn: 'updated_at', location: 'EU', name: 'health' };

describe('BigQuery', () => {
  it('only accepts a service-account key and one reading statement', () => {
    expect(() => parseServiceAccount('not json')).toThrow(/key file/);
    expect(() => parseServiceAccount(JSON.stringify({ type: 'authorized_user' }))).toThrow(/not a service-account key/);
    expect(checkQuery('  select 1 as a;  ')).toBe('select 1 as a');
    expect(checkQuery('WITH t AS (SELECT 1 AS id) SELECT * FROM t')).toContain('WITH');
    expect(() => checkQuery('DELETE FROM `p.d.t` WHERE true')).toThrow(/SELECT or WITH/);
    expect(() => checkQuery('SELECT 1; DROP TABLE x')).toThrow(/one statement/);
    expect(() => checkQuery('SELECT * FROM t WHERE x IN (SELECT 1) AND DELETE')).toThrow(/reading/);
    // Words inside strings, quoted names and comments are not statements.
    expect(checkQuery("SELECT 'drop' AS what, `create` FROM t -- delete later")).toContain('drop');
  });

  it('wraps the query to read only what changed, with the moment as a parameter', () => {
    expect(statement(CONFIG, null).query).toBe('SELECT * FROM (SELECT * FROM `acme-data-1.crm.health`) AS curahold_q ORDER BY `updated_at` ASC');
    const s = statement(CONFIG, '2026-11-10T00:00:00.000Z');
    expect(s.query).toContain('WHERE TIMESTAMP(`updated_at`) >= @since');
    expect(s.params).toEqual([{ name: 'since', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: '2026-11-10T00:00:00.000Z' } }]);
    // Without a modified column every run reads the whole result.
    expect(statement({ ...CONFIG, modifiedColumn: null }, '2026-11-10T00:00:00.000Z')).toEqual({ query: 'SELECT * FROM `acme-data-1.crm.health`', params: [] });
    expect(() => statement({ ...CONFIG, modifiedColumn: 'x`; DROP' }, null)).toThrow(/plain column/);
  });

  it('signs in with the key (never the token address in the file), checks the query and its columns', async () => {
    const { file, pair } = await serviceAccount();
    const w = warehouse(pair);
    const values = { serviceAccount: file, name: 'Customer Health', query: CONFIG.query, idColumn: 'customer_id', modifiedColumn: 'updated_at', location: 'EU' };
    const made = await bigquery.keyed!.connect(w.fetcher, values, NOW);
    expect(made.instanceId).toBe('acme-data-1:customer-health');
    expect(made.label).toBe('BigQuery · customer-health');
    expect(made.config).toMatchObject({ projectId: 'acme-data-1', idColumn: 'customer_id', modifiedColumn: 'updated_at', location: 'EU' });
    expect(made.secret).toMatchObject({ accessToken: 'tok-1', clientEmail: 'curahold@acme-data-1.iam.gserviceaccount.com', expiresAt: NOW.getTime() + 3_600_000 });
    expect(w.asserted).toHaveLength(1);
    expect(w.asserted[0]).toMatchObject({ valid: true, head: { alg: 'RS256' }, claims: { iss: 'curahold@acme-data-1.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/bigquery.readonly', aud: 'https://oauth2.googleapis.com/token' } });
    expect(w.calls.every((c) => !c.url.includes('evil.example'))).toBe(true);
    // The query is checked, not run: a dry run sent with the new token.
    const dry = w.calls.find((c) => c.url.endsWith('/queries'))!;
    expect(dry.body).toMatchObject({ dryRun: true, useLegacySql: false, location: 'EU', maximumBytesBilled: '10000000000' });
    expect(dry.auth).toBe('Bearer tok-1');
    // A column that is not there, or a write, is turned away before anything is saved.
    await expect(bigquery.keyed!.connect(w.fetcher, { ...values, idColumn: 'nope' }, NOW)).rejects.toThrow(/no column called "nope"/);
    await expect(bigquery.keyed!.connect(w.fetcher, { ...values, query: 'UPDATE t SET a = 1 WHERE true' }, NOW)).rejects.toBeInstanceOf(CrmError);
  });

  it('offers the query as one object with its columns; arrays and records are left out', async () => {
    const { pair } = await serviceAccount();
    const ctx = ctxOf(warehouse(pair).fetcher, CONFIG);
    expect(await bigquery.objects(ctx)).toEqual([{ name: 'query', label: 'health', labelPlural: 'health', custom: true, hint: null }]);
    const fields = await bigquery.fields(ctx, 'query');
    expect(fields.map((f) => `${f.name}:${f.type}`)).toEqual(['customer_id:id', 'contact_email:email', 'health_score:number', 'seats:number', 'active:bool', 'updated_at:datetime']);
    expect(fields.every((f) => !f.updatable)).toBe(true);
    expect(await bigquery.users(ctx)).toEqual([]);
  });

  it('reads rows with real types, skips rows without an id, and pages through the same job', async () => {
    const { pair } = await serviceAccount();
    const w = warehouse(pair);
    const ctx = ctxOf(w.fetcher, CONFIG);
    const first = await bigquery.list(ctx, 'query', { since: '2026-11-10T00:00:00.000Z', cursor: null, fields: [] });
    expect(first.rows).toEqual([
      { id: 'C-1', modifiedAt: '2025-11-07T07:20:00.000Z', values: { customer_id: 'C-1', contact_email: 'ops@quillfield.example', health_score: 71.5, seats: 40, active: true, updated_at: '2025-11-07T07:20:00.000Z' } },
    ]);
    expect(first.next).toBe('job_1|EU|next-1');
    const sent = w.calls.find((c) => c.method === 'POST' && c.body && !c.body.dryRun)!;
    expect(sent.body.query).toContain('@since');
    expect(sent.body).toMatchObject({ parameterMode: 'NAMED', maxResults: 500 });
    const second = await bigquery.list(ctx, 'query', { since: null, cursor: first.next, fields: [] });
    expect(second.rows.map((r) => r.id)).toEqual(['C-2']);
    expect(second.rows[0].values.contact_email).toBeNull();
    expect(second.next).toBeNull();
    const page = w.calls.at(-1)!;
    expect(page).toMatchObject({ method: 'GET' });
    expect(page.url).toContain('/queries/job_1?');
    expect(page.url).toContain('pageToken=next-1');
    expect(page.url).toContain('location=EU');
  });

  it('renews its token from the key in the secret, and says to reconnect when Google refuses', async () => {
    const { file, pair } = await serviceAccount();
    const w = warehouse(pair);
    const sa = JSON.parse(file);
    const next = await bigquery.refresh({ fetch: w.fetcher, now: () => NOW, config: CONFIG }, { clientEmail: sa.client_email, privateKey: sa.private_key, projectId: sa.project_id }, { clientId: '', clientSecret: '' });
    expect(next.accessToken).toBe('tok-1');
    await expect(bigquery.refresh({ fetch: w.fetcher, now: () => NOW, config: CONFIG }, {}, { clientId: '', clientSecret: '' })).rejects.toMatchObject({ auth: true });
    const refused = (async () => Response.json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, { status: 400 })) as unknown as typeof fetch;
    const err = await bigquery.refresh({ fetch: refused, now: () => NOW, config: CONFIG }, { clientEmail: sa.client_email, privateKey: sa.private_key }, { clientId: '', clientSecret: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(CrmError);
    expect(err).toMatchObject({ auth: true });
    // The engine marks the connection 'error' on this wording too.
    expect(err.message).toMatch(/reconnect|invalid_grant/i);
  });

  it('is read only', async () => {
    const ctx = ctxOf(warehouse((await serviceAccount()).pair).fetcher, CONFIG);
    expect(bigquery.readOnly).toBe(true);
    await expect(bigquery.update(ctx, 'query', 'C-1', {}, [])).rejects.toThrow(/only read/);
    await expect(bigquery.create(ctx, 'query', {}, [])).rejects.toThrow(/only read/);
    expect(bigquery.url({}, 'query', 'C-1')).toBeNull();
  });
});
