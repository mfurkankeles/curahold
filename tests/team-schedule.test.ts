// The AI team's clock (api/src/team/schedule.ts): the Worker's 10-minute cron
// with cost guards — off by switch, off without a key, still while paused or
// over the cap, idle (no wake, no model call) when nothing is due.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockProvider, respondWith } from '../api/src/assistant/provider';
import { TEAM_DEFAULTS, teamConfigFrom } from '../api/src/team/config';
import { dueCadenceSeats, scheduledTeamTick, TEAM_CRON, teamScheduleState } from '../api/src/team/schedule';
import { seedOrgChart } from '../api/src/team/seed';
import worker, { cronJob } from '../api/src/worker';
import { CADENCES } from '../shared/src/team/cadence';
import { setup, type Env } from './helpers';

let env: Env;
const model = mockProvider(() => respondWith({ reply: 'Kuyruğa baktım; bir iş var, başladım.' }));
// 15:05 in Istanbul on a Thursday: no cadence falls in 14:56–15:05.
const QUIET = new Date('2026-11-19T12:05:00Z');
// 08:40 in Istanbul: the COO's daily brief is due.
const BRIEF = new Date('2026-11-19T05:40:00Z');
const wakes = async () => Number((await env.db.system((q) => q.query(`select coalesce(sum(skipped + ran), 0)::int as n from agent_wakes`)))[0].n);

beforeAll(async () => {
  env = await setup({ assistant: { provider: 'anthropic', apiKey: 'test-key', model: 'mock', globalMonthlyUsd: 100, companyMonthlyUsd: 5, companyMaxUsd: 50, blockedNames: [], publicChat: false } });
  (env.deps as any).assistant = { provider: model };
  await env.db.system((q) => seedOrgChart(q, { by: 'test' }));
  await env.db.system((q) => q.query(`update seats set activated_at = now() where seat in ('coo', 'software-engineer')`));
});
const withTeam = (over: Partial<typeof TEAM_DEFAULTS>) => ((env.deps.config as any).team = { ...TEAM_DEFAULTS, ...over });

describe('the AI team clock', () => {
  it('matches wrangler.toml, and every cadence minute falls on the 10-minute grid', () => {
    const toml = readFileSync('wrangler.toml', 'utf8');
    expect(toml).toContain(`"${TEAM_CRON}"`);
    expect(toml).toContain('"0 * * * *"');
    expect(cronJob(TEAM_CRON)).toBe('team');
    expect(cronJob('0 * * * *')).toBe('hourly');
    expect(cronJob(undefined)).toBe('hourly');
    for (const c of CADENCES) expect(Number(c.cron.split(' ')[0]) % 10, c.cron).toBe(0);
    expect(dueCadenceSeats(QUIET, 10).size).toBe(0);
    expect([...dueCadenceSeats(BRIEF, 10)]).toContain('coo');
  });

  it('the Worker returns without a database connection when there is no key or it is switched off', async () => {
    const base = { AUTH_SECRET: 'x'.repeat(40), PLATFORM_OWNER: 'owner@curahold.test', BASE_DOMAIN: 'curahold.test', CENTRAL_HOST: 'app.curahold.test' };
    const waited: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waited.push(p) };
    // No HYPERDRIVE binding: touching the database would throw.
    await worker.scheduled({ cron: TEAM_CRON }, base as any, ctx);
    await worker.scheduled({ cron: TEAM_CRON }, { ...base, ANTHROPIC_API_KEY: 'k', TEAM_SCHEDULER: 'off' } as any, ctx);
    expect(waited).toEqual([]);
  });

  it('is switchable: TEAM_SCHEDULER=off stops it, the default is auto', () => {
    expect(teamConfigFrom({}).scheduler).toBe('auto');
    expect(teamConfigFrom({ TEAM_SCHEDULER: 'off' }).scheduler).toBe('off');
    expect(teamConfigFrom({ TEAM_SCHEDULER: 'OFF ' }).scheduler).toBe('off');
  });

  it('off, or without a key: nothing is read, nothing runs', async () => {
    env.clock.now = BRIEF;
    withTeam({ scheduler: 'off' });
    const n = model.calls.length;
    expect(await scheduledTeamTick(env.deps as any)).toEqual({ status: 'off', woke: [] });
    withTeam({});
    const keyless = { ...env.deps, assistant: undefined, config: { ...env.deps.config, assistant: undefined } };
    expect(teamScheduleState(keyless as any)).toBe('no-key');
    expect(await scheduledTeamTick(keyless as any)).toEqual({ status: 'no-key', woke: [] });
    const switchedOff = { ...keyless, config: { ...keyless.config, assistant: { ...(env.deps.config as any).assistant, provider: 'off' } } };
    expect((await scheduledTeamTick(switchedOff as any)).status).toBe('no-key');
    expect(model.calls.length).toBe(n);
  });

  it('paused by the owner, or over the monthly cap: no wake', async () => {
    env.clock.now = BRIEF;
    const w0 = await wakes();
    await env.db.system((q) => q.query(`insert into agent_pauses (scope, target, reason, paused_by) values ('all', null, 'test', 'owner@curahold.test')`));
    expect((await scheduledTeamTick(env.deps as any)).status).toBe('paused');
    await env.db.system((q) => q.query(`update agent_pauses set resumed_at = now(), resumed_by = 'test' where resumed_at is null`));
    withTeam({ monthlyUsd: 0 });
    expect((await scheduledTeamTick(env.deps as any)).status).toBe('cap');
    withTeam({});
    expect(await wakes()).toBe(w0);
  });

  it('idle when nothing is due and nothing is queued: no wake, no model call', async () => {
    env.clock.now = QUIET;
    const [n, w0] = [model.calls.length, await wakes()];
    expect(await scheduledTeamTick(env.deps as any)).toEqual({ status: 'idle', woke: [] });
    expect(model.calls.length).toBe(n);
    expect(await wakes()).toBe(w0);
  });

  it('queued work wakes its seat once, then the clock is idle again', async () => {
    env.clock.now = QUIET;
    await env.db.system((q) => q.query(`insert into agent_tasks (seat, title, from_seat) values ('software-engineer', 'Fix the due-date label', 'cto')`));
    const n = model.calls.length;
    const r = await scheduledTeamTick(env.deps as any);
    expect(r.status).toBe('ran');
    expect(r.woke).toEqual([{ seat: 'software-engineer', ran: true, reason: 'ok' }]);
    expect(model.calls.length).toBe(n + 1);
    // The queue is now the seat's own (running): the next quiet tick is idle again.
    expect((await scheduledTeamTick(env.deps as any)).status).toBe('idle');
  });
});
