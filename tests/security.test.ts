// Hardening that must not regress: who counts as the platform owner (nobody
// unless named), the browser-side headers, who may let support in and how
// support gets in (a key per person, a short list of reachable paths).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertOwnerConfigured } from '../api/src/context';
import { APP_CSP, HSTS } from '../api/src/lib/headers';
import { supportBlocked } from '../api/src/lib/support';
import { BASE, Client, login, setup, type Env } from './helpers';

const PERSON = 'deniz@curahold.test';
const PERSON_KEY = 'deniz-personal-key-deniz-personal-key-1';
const SHARED_KEY = 'shared-key-shared-key-shared-key-0000';

let env: Env;
let ada: Client;
let zeynep: Client;

beforeAll(async () => {
  env = await setup({ staffKey: SHARED_KEY, staffKeys: { [PERSON]: PERSON_KEY }, support: { email: 'desk@curahold.test', staff: [PERSON] } });
  ada = await login(env, 'acme', 'ada@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
});

describe('the platform owner fails closed', () => {
  it('without a configured owner, in production mode, nobody is the owner (not even a company administrator)', async () => {
    const dev = env.config.devExposeTokens;
    env.config.devExposeTokens = false;
    try {
      expect((await ada.get('/api/me')).json.owner).toBe(false);
      expect((await ada.get('/api/metrics')).status).toBe(403);
      env.config.owner = 'ada@demo.example';
      expect((await ada.get('/api/metrics')).status).toBe(200);
      expect((await zeynep.get('/api/metrics')).status).toBe(403);
    } finally {
      env.config.devExposeTokens = dev;
      delete env.config.owner;
    }
  });

  it('a multi-company install refuses to start without an owner', () => {
    expect(() => assertOwnerConfigured({ devExposeTokens: false })).toThrow(/PLATFORM_OWNER/);
    expect(() => assertOwnerConfigured({ devExposeTokens: false, owner: 'a@b.test' })).not.toThrow();
    // A single-company install has only its own data to show.
    expect(() => assertOwnerConfigured({ devExposeTokens: false, singleTenantSlug: 'us' })).not.toThrow();
  });
});

describe('browser protections', () => {
  it('every API answer carries the policy, HSTS and no-framing headers', async () => {
    const r = await ada.get('/api/me');
    expect(r.headers.get('content-security-policy')).toBe(APP_CSP);
    expect(r.headers.get('content-security-policy')).toContain('https://cdn.paddle.com');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('strict-transport-security')).toBe(HSTS);
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await env.app.request(`https://app.${BASE}/api/health`)).headers.get('x-frame-options')).toBe('DENY');
  });

  it('the static app gets the very same policy from web/public/_headers', () => {
    const file = readFileSync(join(import.meta.dirname, '..', 'web', 'public', '_headers'), 'utf8');
    const first = file.split(/\n\s*\n/)[0];
    expect(first).toContain(`Content-Security-Policy: ${APP_CSP}`);
    expect(first).toContain(`Strict-Transport-Security: ${HSTS}`);
    expect(first).toContain('X-Frame-Options: DENY');
    // The one inline script (light/dark) is allowed by its hash: the hash must match index.html.
    const html = readFileSync(join(import.meta.dirname, '..', 'web', 'index.html'), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toHaveLength(1);
    const hash = createHash('sha256').update(inline[0]).digest('base64');
    expect(APP_CSP).toContain(`'sha256-${hash}'`);
  });
});

describe('support access', () => {
  let grantId = '';

  it('by default only an administrator may let support in', async () => {
    expect((await zeynep.post('/api/support/grants', { hours: 24, level: 'view' })).json.error).toBe('support_not_allowed');
    const g = await ada.post('/api/support/grants', { hours: 24, level: 'view' });
    expect(g.status).toBe(201);
    grantId = g.json.grant.id;
    expect((await ada.get('/api/support/grants')).json.policy).toBe('admins');
  });

  const enterLink = (key: string, staff = 'Someone Else') =>
    env.app.request(`https://acme.${BASE}/api/support/enter-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-staff-key': key },
      body: JSON.stringify({ grantId, staff }),
    });

  it('in production the shared key opens nothing; a person’s own key does, and names them', async () => {
    env.config.devExposeTokens = false;
    try {
      expect((await enterLink(SHARED_KEY)).status).toBe(403);
      expect((await enterLink('wrong-wrong-wrong-wrong-wrong-wrong')).status).toBe(403);
      const ok = await enterLink(PERSON_KEY, 'Not My Name <boss@curahold.test>');
      expect(ok.status).toBe(201);
      const [row] = await env.db.system((q) => q.query(`select staff from support_sessions where grant_id = $1 order by entered_at desc limit 1`, [grantId]));
      expect(row.staff).toContain(`<${PERSON}>`);
      expect(row.staff).not.toContain('boss@');
    } finally {
      env.config.devExposeTokens = true;
    }
  });

  it('a key only counts for someone still on the support list', async () => {
    env.config.devExposeTokens = false;
    const staff = env.config.support!.staff;
    env.config.support!.staff = [];
    try {
      expect((await enterLink(PERSON_KEY)).status).toBe(403);
    } finally {
      env.config.support!.staff = staff;
      env.config.devExposeTokens = true;
    }
  });

  it('support reaches only what a person works with: an allowlist, not a blocklist', () => {
    for (const p of ['/api/boards', '/api/tasks/1', '/api/accounts', '/api/search', '/api/me']) expect(supportBlocked('GET', p), p).toBe(false);
    for (const p of ['/api/admin/users', '/api/admin/roles', '/api/billing', '/api/metrics', '/api/dev/keys', '/api/portal/people', '/api/imports', '/api/replay', '/api/support/grants', '/api/some-new-route']) {
      expect(supportBlocked('GET', p), p).toBe(true);
    }
  });
});
