// A connection's raw vendor error is shown as one of four plain explanations in the reader's language, with
// the vendor text under it (web/src/components/ConnectionTrouble.tsx). This pins the classifier and the words.
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES } from '../shared/src/i18n';
import { troubleOf } from '../shared/src/sync';

describe('troubleOf: which plain explanation a vendor message belongs to', () => {
  it.each([
    ['expired access/refresh token', 'auth'],
    ['invalid_grant: Token has been expired or revoked.', 'auth'],
    ['401 Unauthorized', 'auth'],
    ['app removed from workspace', 'auth'],
    ['Forbidden: bot was kicked from the group chat', 'permission'],
    ['403 insufficient_scope', 'permission'],
    ['429 Too Many Requests (token bucket empty)', 'rate'],
    ['Rate limit exceeded, retry after 30s', 'rate'],
    ['fetch failed', 'unreachable'],
    ['getaddrinfo ENOTFOUND acme.example', 'unreachable'],
    ['503 Service Unavailable', 'unreachable'],
  ])('%s → %s', (message, kind) => {
    expect(troubleOf(message)).toBe(kind);
  });

  it('says nothing about an empty or unknown message (the screen then uses the neutral sentence)', () => {
    expect(troubleOf(null)).toBeNull();
    expect(troubleOf('   ')).toBeNull();
    expect(troubleOf('Webhook delivery returned 400: unknown field "colour"')).toBeNull();
  });
});

describe('the words exist in every language', () => {
  it.each(LOCALES.map((l) => [l] as const))('%s has the neutral sentence and the calm rate-limit state', (l) => {
    const d = dictionaries[l] as Record<string, string>;
    expect(d['sync.errorCode.other']).toContain('{app}');
    expect(d['sync.rateWait']?.length).toBeGreaterThan(3);
    // The rate-limit badge must not reuse the alarming "needs a look" words.
    expect(d['sync.rateWait']).not.toBe(d['sync.needsLook']);
  });
});
