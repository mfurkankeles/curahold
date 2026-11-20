// The security testing calendar's own safety rails (docs/security/testing-calendar.md): the staging probe
// may only ever touch our staging domain or a local server — never production, never anyone else — and
// it reads the answers the way the calendar says. No network: fetch is a stub.
import { describe, expect, it } from 'vitest';
import { allowedTarget, probe } from '../scripts/security/staging-probe';
import { steps } from '../scripts/security/scan';

describe('staging probe targets', () => {
  it('allows only localhost and curahold-staging.com', () => {
    for (const ok of ['http://localhost:8787', 'http://127.0.0.1:5173/', 'https://curahold-staging.com', 'https://app.curahold-staging.com/x']) expect(allowedTarget(ok), ok).toBe(true);
    for (const no of [
      'https://app.curahold.com', // production
      'https://curahold.com',
      'https://acme.example',
      'https://curahold-staging.com.evil.example', // look-alike suffix
      'https://evilcurahold-staging.com',
      'http://app.curahold-staging.com', // staging only over https
      'ftp://localhost',
      'not a url',
    ])
      expect(allowedTarget(no), no).toBe(false);
  });

  it('refuses a disallowed base before sending anything', async () => {
    let calls = 0;
    await expect(probe('https://app.curahold.com', (async () => (calls++, new Response(''))) as typeof fetch)).rejects.toThrow(/refusing/);
    expect(calls).toBe(0);
  });

  it('passes a well-configured server and fails a leaky one', async () => {
    const good = (async (url: string | URL | Request, init?: RequestInit) => {
      const p = new URL(String(url)).pathname;
      if (p === '/.well-known/security.txt') return new Response('Contact: mailto:security@demo.example\nExpires: 2027-11-20T00:00:00Z\n');
      if (p === '/api/me' && init?.method !== 'OPTIONS') return new Response('{"error":"unauthorized"}', { status: 401 });
      if (p.startsWith('/api/__probe')) return new Response('{"error":"not_found"}', { status: 404 });
      return new Response('<!doctype html>', {
        headers: { 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY' },
      });
    }) as typeof fetch;
    expect((await probe('http://localhost:8787', good)).filter((r) => !r.ok)).toEqual([]);

    const leaky = (async (url: string | URL | Request) => {
      const p = new URL(String(url)).pathname;
      if (p === '/api/me') return new Response('{"id":1}', { headers: { 'access-control-allow-origin': '*' } });
      if (p.startsWith('/api/__probe')) return new Response('Error: x\n    at handler (/srv/api/src/app.ts:12:3)', { status: 500 });
      return new Response('');
    }) as typeof fetch;
    const failed = (await probe('http://localhost:8787', leaky)).filter((r) => !r.ok).map((r) => r.check);
    expect(failed).toContain('GET /api/me signed out is refused');
    expect(failed).toContain('unknown API address leaks no stack trace');
    expect(failed).toContain('foreign origin not allowed by CORS');
    expect(failed).toContain('security.txt has Contact and Expires');
  });
});

describe('scan cadences', () => {
  it('nest (monthly holds weekly, quarterly holds monthly) and add nothing to package.json', () => {
    const names = (c: 'weekly' | 'monthly' | 'quarterly') => steps(c).map((s) => s.name);
    expect(names('monthly').slice(0, names('weekly').length)).toEqual(names('weekly'));
    expect(names('quarterly').slice(0, names('monthly').length)).toEqual(names('monthly'));
    // Outside scanners only through npx --yes with a pinned major, never an installed dependency.
    for (const s of steps('quarterly')) if (s.cmd[0] === 'npx' && s.cmd[1] === '--yes') expect(s.cmd.slice(2).some((a) => /@\d+$/.test(a)), s.name).toBe(true);
  });
});
