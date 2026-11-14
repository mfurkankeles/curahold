// Admins hear about a failing integration once per episode — when it starts
// failing and when it recovers — never on every cycle.
import { describe, expect, it } from 'vitest';
import { syncAlert } from '../api/src/sync/engine';
import { render } from '../api/src/lib/notify';

const NOW = '2026-01-01T00:00:00.000Z';
const EARLIER = '2025-12-31T00:00:00.000Z';

describe('syncAlert — once per failure episode', () => {
  it('stays quiet on a single error (could be a blip)', () => {
    const r = syncAlert({ lastRun: { status: 'ok' } }, 'error', false, NOW);
    expect(r.kind).toBe(null);
    expect(r.alertedAt).toBe(null);
  });

  it('alerts on two error runs back to back', () => {
    const r = syncAlert({ lastRun: { status: 'error' } }, 'error', false, NOW);
    expect(r.kind).toBe('sync_failed');
    expect(r.alertedAt).toBe(NOW);
    expect(r.stamp).toBe(NOW);
  });

  it('alerts at once when the credentials are gone, even on the first error', () => {
    const r = syncAlert({ lastRun: { status: 'ok' } }, 'error', true, NOW);
    expect(r.kind).toBe('sync_failed');
    expect(r.alertedAt).toBe(NOW);
  });

  it('does not alert again while it keeps failing', () => {
    const r = syncAlert({ lastRun: { status: 'error' }, alertedAt: EARLIER }, 'error', true, NOW);
    expect(r.kind).toBe(null);
    expect(r.alertedAt).toBe(EARLIER); // marker is kept
  });

  it('sends a recovery note once, then clears the marker', () => {
    const r = syncAlert({ lastRun: { status: 'error' }, alertedAt: EARLIER }, 'ok', false, NOW);
    expect(r.kind).toBe('sync_recovered');
    expect(r.stamp).toBe(EARLIER); // deduped against the episode it recovered from
    expect(r.alertedAt).toBe(null);
  });

  it('says nothing on recovery if it never warned', () => {
    const r = syncAlert({ lastRun: { status: 'ok' }, alertedAt: null }, 'ok', false, NOW);
    expect(r.kind).toBe(null);
    expect(r.alertedAt).toBe(null);
  });
});

const ctx = (kind: string, data: Record<string, unknown>, locale: 'en' | 'tr' = 'en') =>
  ({ locale, terms: {}, orgName: 'Acme', base: 'https://acme.curahold.test', n: { kind, data } as any, task: null, actorName: null }) as any;

describe('render — sync alerts', () => {
  it('a lost connection tells admins to reconnect', () => {
    const msg = render(ctx('sync_failed', { app: 'Salesforce', auth: true }));
    expect(msg.title).toContain('Salesforce');
    expect(msg.body).toContain('Reconnect');
    expect(msg.body).toContain('Salesforce');
    expect(msg.url).toBe('https://acme.curahold.test/settings/sources');
  });

  it('a repeatedly failing connection points at Connections', () => {
    const msg = render(ctx('sync_failed', { app: 'HubSpot', auth: false }));
    expect(msg.body).toContain('failed to sync');
    expect(msg.body).toContain('Connections');
  });

  it('recovery reads as back to normal', () => {
    const msg = render(ctx('sync_recovered', { app: 'Jira' }));
    expect(msg.title).toContain('syncing again');
    expect(msg.title).toContain('Jira');
  });

  it('renders in Turkish too', () => {
    const msg = render(ctx('sync_failed', { app: 'Salesforce', auth: true }, 'tr'));
    expect(msg.title).toContain('Eşitleme sorunu');
    expect(msg.title).toContain('Salesforce');
  });
});
