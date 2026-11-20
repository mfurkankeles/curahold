// A demo-only sample for the owner console's investor side, so the local
// console (npm run dev, the browser tests, the help pictures) shows Budget &
// investors filled in: the plan's two fundraising windows, a few budget lines
// around this month, cash for the runway and four investors at different
// stages. Everything is invented — no real investor, fund or programme — and
// it is NEVER run in production: only the local server (api/src/node.ts) calls it.
import type { Db } from '../api/src/db';
import { addPeriod, planWindows } from '../shared/src/ownerPlan';

/** Fills the investor side with invented sample data, once (does nothing when windows already exist). */
export async function seedOwnerPlan(db: Db, now = new Date()): Promise<void> {
  const period = now.toISOString().slice(0, 7);
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  await db.system(async (q) => {
    const [had] = await q.query(`select 1 from fundraising_windows limit 1`);
    if (had) return;
    const ids: Record<string, string> = {};
    for (const w of planWindows(addPeriod(period, 2), 'en')) {
      const [r] = await q.query<{ id: string }>(
        `insert into fundraising_windows (key, name, opens_on, closes_on, target_min, target_max, conditions) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [w.key, w.name, w.opensOn, w.closesOn, w.targetMin, w.targetMax, w.conditions],
      );
      ids[w.key] = r.id;
    }
    const lines: [number, string, number, number | null][] = [
      [-1, 'Infrastructure', 160, 152],
      [-1, 'Accounting', 130, 130],
      [0, 'Infrastructure', 180, 95],
      [0, 'Accounting', 130, null],
      [0, 'Marketing: content', 300, 120],
      [1, 'Infrastructure', 180, null],
      [1, 'Marketing: content', 300, null],
      [2, 'Legal', 990, null],
    ];
    for (const [m, category, planned, actual] of lines)
      await q.query(`insert into plan_budget (period, category, planned, actual, source) values ($1, $2, $3, $4, 'plan')`, [addPeriod(period, m), category, planned, actual]);
    await q.query(`insert into console_settings (key, value) values ('budget.cash', '12000'::jsonb), ('budget.cashOn', $1::jsonb) on conflict (key) do nothing`, [JSON.stringify(day(-3))]);
    const people: [string, string, string, string | null, string | null, number | null, number | null][] = [
      ['Acme Angels Network', 'angel', 'meeting', 'pre-seed', 'Send the one-page update', 3, 25000],
      ['Northpeak Seed Partners', 'fund', 'contacted', 'seed', 'Intro call with the partner', 9, null],
      ['Brightwell Accelerator', 'accelerator', 'idea', 'pre-seed', 'Check the next intake date', -1, null],
      ['Vireo Ventures', 'fund', 'passed', null, null, null, null],
    ];
    for (const [name, kind, stage, win, next, inDays, amount] of people)
      await q.query(`insert into investor_pipeline (name, kind, stage, window_id, next_step, next_on, amount) values ($1, $2, $3, $4, $5, $6, $7)`, [
        name,
        kind,
        stage,
        win ? ids[win] : null,
        next,
        inDays == null ? null : day(inDays),
        amount,
      ]);
  });
}
