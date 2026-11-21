// Secrets and personal data never reach the error table or the platform's logs (lib/errlog.ts).
import { describe, expect, it } from 'vitest';
import { recordError, redact } from '../api/src/lib/errlog';
import { setup } from './helpers';

describe('masking what an error record keeps', () => {
  it.each([
    ['Authorization: Bearer chk_live_9f8e7d6c5b4a39281706', 'chk_live_9f8e7d6c5b4a39281706'],
    ['fetch failed for https://acme.curahold.com/api/calendar/7GkP2xVq9LmN4rT8yWb3ZsD6fH1jKc0e.ics', '7GkP2xVq9LmN4rT8yWb3ZsD6fH1jKc0e'],
    ['POST /api/inbound/tickets/Qw3rTy8uIo9pAs2dFg5hJk7lZx4cVb6n', 'Qw3rTy8uIo9pAs2dFg5hJk7lZx4cVb6n'],
    ['bad signature whsec_AbCdEfGhIjKlMnOpQrStUvWx', 'whsec_AbCdEfGhIjKlMnOpQrStUvWx'],
    ['login failed {"password":"hunter2-is-long","email":"x"}', 'hunter2-is-long'],
    ['callback ?code=4/0AbCdEf123&state=xyz', '4/0AbCdEf123'],
    ['id_token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl rejected', 'eyJhbGciOiJSUzI1NiJ9'],
    ['no user selin.kaya@quillfield.example', 'selin.kaya'],
    // Every prefix Curahold's own tokens use (lib/tokens.ts), outside a "Bearer" too (security audit L4).
    ['refresh rejected: chr_Zq8Xw2Vu4Ts6Rq0Po9Nm', 'chr_Zq8Xw2Vu4Ts6Rq0Po9Nm'],
    ['app token cha_Lk3Jh5Gf7Ds9Ap1Oi2Uy expired', 'cha_Lk3Jh5Gf7Ds9Ap1Oi2Uy'],
    ['analytics key chb_Mn4Bv6Cx8Za0Sd2Fg4Hj in the address', 'chb_Mn4Bv6Cx8Za0Sd2Fg4Hj'],
  ])('%s', (text, secret) => {
    expect(redact(text)).not.toContain(secret);
  });

  it('keeps what helps find the fault: ids, routes, the email domain', () => {
    const s = redact('GET /api/accounts/5f0c2b1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e failed for ada@demo.example: TypeError: x is undefined');
    expect(s).toContain('/api/accounts/5f0c2b1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e');
    expect(s).toContain('@demo.example');
    expect(s).toContain('TypeError: x is undefined');
  });

  it('is applied before anything is written', async () => {
    const env = await setup();
    await recordError(env.deps, { source: 'server', orgId: env.a.orgId, method: 'GET', path: '/api/calendar/7GkP2xVq9LmN4rT8yWb3ZsD6fH1jKc0e.ics', message: 'boom for lena@demo.example token=abcdef123456', detail: 'Bearer chk_abcdefghijklmnop' });
    const [row] = await env.db.system((q) => q.query(`select path, message, detail from error_log where org_id = $1 order by at desc limit 1`, [env.a.orgId]));
    expect(JSON.stringify(row)).not.toMatch(/7GkP2xVq9|lena@|abcdef123456|chk_abcdefghijklmnop/);
  });
});
