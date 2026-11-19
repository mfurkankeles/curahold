// Puts the org chart (shared/src/team/orgChart.ts) into the seats tables.
// First run: every seat. Later runs keep the owner's edits unless he asks
// for the default back (reset), and never touch a seat a person holds.
import type { Q } from '../db';
import { ORG_CHART } from '../../../shared/src/team/orgChart';
import { auditLine } from '../lib/office';

export async function seedOrgChart(q: Q, opts: { reset?: boolean; by: string }): Promise<{ added: number; reset: number }> {
  let added = 0;
  let reset = 0;
  // Leads first (depth order), so every reports_to points at a seat that exists.
  const depth = (seat: string, n = 0): number => {
    const lead = ORG_CHART.find((x) => x.seat === seat)?.reportsTo;
    return lead && n < 10 ? depth(lead, n + 1) : n;
  };
  for (const s of [...ORG_CHART].sort((a, b) => depth(a.seat) - depth(b.seat))) {
    const [had] = await q.query('select filled_by from seats where seat = $1', [s.seat]);
    if (had && (!opts.reset || had.filled_by === 'human')) continue;
    await q.query(
      `insert into seats (seat, title, title_tr, team, reports_to, tier, state, cadence, weekly_budget, wake_trigger, card)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (seat) do update set title = excluded.title, title_tr = excluded.title_tr, team = excluded.team, reports_to = excluded.reports_to,
         tier = excluded.tier, state = excluded.state, cadence = excluded.cadence, weekly_budget = excluded.weekly_budget,
         wake_trigger = excluded.wake_trigger, card = excluded.card, updated_at = now()`,
      [s.seat, s.title, s.titleTr, s.team, s.reportsTo, s.tier, s.state, s.cadence, s.weeklyBudget, s.wakeTrigger ?? null, JSON.stringify({ ...s.card, level: s.level })],
    );
    const [agent] = await q.query('select id from agents where seat = $1', [s.seat]);
    if (agent) await q.query('update agents set name = $2, effort = $3 where id = $1', [agent.id, s.name, s.model]);
    else await q.query('insert into agents (seat, name, effort) values ($1, $2, $3)', [s.seat, s.name, s.model]);
    if (had) reset++;
    else added++;
  }
  await auditLine(q, { seat: 'all', actor: opts.by.includes('@') ? 'owner' : 'system', what: opts.reset ? 'org.reset' : 'org.seed', detail: { added, reset, by: opts.by } });
  return { added, reset };
}
