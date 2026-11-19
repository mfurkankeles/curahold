// The cost model behind the owner's pricing: what one company and one seat cost
// us a month, fixed monthly costs, and the break-even point — for 1 to 300
// customers of typical team sizes, on the price list in shared/src/plans.json.
//
//   npx tsx scripts/quality/cost.mts           the tables
//   npx tsx scripts/quality/cost.mts --json    the same numbers as JSON (for the forecast sheet)
//
// The owner's rule: be the cheapest possible, but never loss-making per
// customer. So every company is priced twice: TYPICAL (expected use) and WORST
// (every cost driver at its plan cap: CuraAI answers all on Sonnet with no answer
// cache, files at the storage cap, every connector syncing at the plan's
// frequency). The caps are enforced on the server (api/src/billing/entitlements.ts),
// so WORST is a real ceiling, not a guess.
//
// Every input lives in scripts/quality/cost.inputs.json with its source or
// "assumption"; this file only does arithmetic. Taxes are a pass-through (Paddle
// adds, collects and files them), so they are never revenue or cost — only
// Paddle's percentage may apply to the tax-inclusive total.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, PLANS, capsOf, regionalPrice, type Caps, type Interval, type PlanKey } from '../../shared/src/billing';

type Input<T = number> = { value: T; source: string };
const raw = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cost.inputs.json'), 'utf8'));
/** Every input with its value only (sources stay in the file and are checked by tests/cost-model.test.ts). */
const values = (group: Record<string, Input<unknown>>) => Object.fromEntries(Object.entries(group).map(([k, v]) => [k, v.value])) as any;
export const IN = {
  hosting: values(raw.hosting),
  email: values(raw.email),
  paddle: values(raw.paddle),
  ai: values(raw.ai),
  usage: values(raw.usage),
  sync: values(raw.sync),
  support: values(raw.support),
  trial: values(raw.trial),
  fx: values(raw.fx),
  scenarios: values(raw.scenarios),
};
export const INPUTS_READ_ON: string = raw.readOn;

export type Mode = 'typical' | 'worst';
const MONTH_MINUTES = 30 * 24 * 60;

/** USD for one model-answered question, on the model mix and answer-cache share of the mode. */
export function costPerQuestion(mode: Mode): number {
  const a = IN.ai;
  const sonnet = mode === 'worst' ? a.worstCase.sonnetShare : a.sonnetShare;
  const hit = mode === 'worst' ? a.worstCase.answerCacheHitShare : a.answerCacheHitShare;
  const one = (p: { input: number; cacheRead: number; output: number }) => (a.freshInputTokens * p.input + a.cachedInputTokens * p.cacheRead + a.outputTokens * p.output) / 1e6;
  return (sonnet * one(a.prices.sonnet) + (1 - sonnet) * one(a.prices.haiku)) * a.callsPerQuestion * (1 - hit);
}

/** What one company's use is in a month: the drivers the bill is made of. */
export function usageOf(seats: number, caps: Caps, mode: Mode) {
  const u = IN.usage;
  const active = seats * (1 + u.viewersPerSeat * u.viewerActivity);
  const appRequests = active * u.workDays * (u.opensPerDay * u.apiCallsPerOpen + u.writesPerDay + u.pollsPerDay);
  const connectors = mode === 'worst' ? (caps.connectors ?? 10) : Math.min(IN.sync.connectorsTypical, caps.connectors ?? Infinity);
  // The scheduler runs hourly, so nothing syncs more often than that on its own.
  const runs = connectors * (MONTH_MINUTES / Math.max(60, caps.syncEveryMinutes ?? 60));
  const questions = mode === 'worst' ? (caps.aiQuestionsPerSeat ?? IN.ai.questionsPerSeatTypical * 10) * seats : Math.min(IN.ai.questionsPerSeatTypical, caps.aiQuestionsPerSeat ?? Infinity) * seats;
  const fileGb = mode === 'worst' ? (caps.storageGbPerSeat ?? u.fileGbPerSeatTypical * 10) * seats : Math.min(u.fileGbPerSeatTypical, caps.storageGbPerSeat ?? Infinity) * seats;
  return {
    requests: appRequests + runs * IN.sync.requestsPerRun,
    cpuMs: appRequests * u.cpuMsPerRequest + runs * IN.sync.cpuMsPerRun,
    syncRuns: runs,
    questions,
    fileGb,
    dbGb: (seats * u.dbMbPerSeat) / 1024,
    fileWrites: seats * u.fileWritesPerSeat,
    fileReads: seats * u.fileReadsPerSeat,
    egressGb: seats * u.fileEgressGbPerSeat,
    mails: seats * u.mailsPerSeat,
  };
}

/**
 * One company's own monthly cost, at marginal prices (no free allowance credited:
 * those belong to the whole installation), by line. Paddle's fee is on the charge.
 */
export function companyCost(seats: number, plan: PlanKey, interval: Interval, mode: Mode, opts: { trial?: boolean; price?: number; taxRate?: number } = {}) {
  const h = IN.hosting;
  const caps = capsOf({ state: opts.trial ? 'trial' : 'active', plan }, seats);
  const use = usageOf(seats, caps, mode);
  const lines = {
    workers: (use.requests / 1e6) * h.workersPerMillionRequests + (use.cpuMs / 1e6) * h.workersPerMillionCpuMs,
    database: use.dbGb * h.dbPerGb,
    files: use.fileGb * h.r2PerGbMonth + (use.fileWrites / 1e6) * h.r2PerMillionWrites + (use.fileReads / 1e6) * h.r2PerMillionReads + use.egressGb * h.r2EgressPerGb,
    // The Workspace relay has no per-message price; above its daily limit the install moves to Resend (a fixed tier, below).
    email: 0,
    ai: use.questions * costPerQuestion(mode),
    sync: use.syncRuns * IN.sync.outboundApiCost,
    support: ((opts.trial ? IN.support.minutesPerTrial / CATALOGUE.trial.months : IN.support.minutesPerCompanyMonth + IN.support.minutesPerSeatMonth * seats) / 60) * IN.support.hourlyCost,
    paddle: 0,
  };
  if (!opts.trial) {
    const each = opts.price ?? PLANS[plan].price[interval];
    const months = interval === 'year' ? 12 : 1;
    const charge = each * seats * months * (IN.paddle.feeOnTaxInclusive ? 1 + (opts.taxRate ?? 0) : 1);
    lines.paddle = (charge * IN.paddle.share + IN.paddle.perCharge) / months;
  }
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { seats, lines, total, perSeat: total / seats, use };
}

/** What the trials that come before one paying company cost, spread over its paid lifetime (per month). */
export function trialShare(seats: number, mode: Mode): number {
  const seatsInTrial = Math.min(seats, CATALOGUE.trial.autoApproveSeats);
  const oneTrial = companyCost(seatsInTrial, CATALOGUE.trial.plan, 'month', mode, { trial: true }).total * CATALOGUE.trial.months;
  return oneTrial / IN.trial.conversion / IN.trial.customerLifetimeMonths;
}

/** A paying company's full picture: revenue (net of tax), cost, contribution. */
export function unit(seats: number, plan: PlanKey, interval: Interval, mode: Mode, price?: number, taxRate?: number) {
  const each = price ?? PLANS[plan].price[interval];
  const c = companyCost(seats, plan, interval, mode, { price: each, taxRate });
  const trial = trialShare(seats, mode);
  const cost = c.total + trial;
  const revenue = each * seats;
  return { seats, revenue, cost, trial, lines: c.lines, perSeat: cost / seats, contribution: revenue - cost, margin: revenue ? (revenue - cost) / revenue : 0 };
}

/** The installation's fixed monthly costs for N customers with `totalSeats` (machine size, PITR, mail tier grow with it). */
export function fixedCosts(customers: number, totalSeats: number, totalMails: number) {
  const h = IN.hosting;
  const machine = totalSeats > 4000 ? 'large' : totalSeats > 1500 ? 'medium' : totalSeats > 300 || customers >= IN.scenarios.pitrFromCustomers ? 'small' : 'micro';
  const relayMonth = IN.email.relayRecipientsPerDay * 30;
  const resend = totalMails > relayMonth ? ((IN.email.resendTiers as { upTo: number; monthly: number }[]).find((t) => totalMails <= t.upTo) ?? IN.email.resendTiers.at(-1)).monthly : 0;
  const lines = {
    workersPlan: h.workersMonthly,
    database: h.dbPlanMonthly + Math.max(0, h.dbMachineMonthly[machine] - h.dbComputeCredit) + (customers >= IN.scenarios.pitrFromCustomers ? h.dbPitrMonthly : 0),
    domains: h.domainsMonthly,
    emailWorkspace: IN.email.workspaceSeatMonthly,
    emailResend: resend,
    aiTeam: IN.ai.aiTeamMonthlyCap,
  };
  return { machine, lines, total: Object.values(lines).reduce((a, b) => a + b, 0) };
}

/** A scenario: N paying customers in the team mix, on one plan and interval. */
export function scenario(customers: number, mode: Mode, plan: PlanKey = IN.scenarios.plan, interval: Interval = IN.scenarios.interval) {
  const mix = IN.scenarios.teamMix as { seats: number; share: number }[];
  let seats = 0;
  let variable = 0;
  let revenue = 0;
  let mails = 0;
  for (const m of mix) {
    const n = customers * m.share;
    const u = unit(m.seats, plan, interval, mode);
    seats += n * m.seats;
    variable += n * u.cost;
    revenue += n * u.revenue;
    mails += n * m.seats * IN.usage.mailsPerSeat;
  }
  const fixed = fixedCosts(customers, seats, mails);
  const total = variable + fixed.total;
  return { customers, seats, revenue, variable, fixed: fixed.total, total, perCompany: total / customers, perSeat: total / seats, profit: revenue - total, machine: fixed.machine };
}

/** Customers of the average mix needed so that their contribution covers the fixed costs. */
export function breakEven(mode: Mode, plan: PlanKey = IN.scenarios.plan, interval: Interval = IN.scenarios.interval): number | null {
  for (let n = 1; n <= 100_000; n++) if (scenario(n, mode, plan, interval).profit >= 0) return n;
  return null;
}

/** The fewest full seats at which a company on this plan and price is not loss-making (worst case). */
export function minSeats(plan: PlanKey, interval: Interval, price?: number, taxRate?: number): number | null {
  for (let s = 1; s <= 500; s++) if (unit(s, plan, interval, 'worst', price, taxRate).contribution >= 0) return s;
  return null;
}

if (process.argv[1]?.endsWith('cost.mts')) {
  const usd = (n: number) => `$${n.toFixed(Math.abs(n) < 10 ? 2 : 0)}`;
  const pc = (n: number) => `${(n * 100).toFixed(0)}%`;
  const plan = IN.scenarios.plan as PlanKey;
  const interval = IN.scenarios.interval as Interval;
  const sizes = (IN.scenarios.teamMix as { seats: number }[]).map((m) => m.seats);
  const out = {
    readOn: INPUTS_READ_ON,
    catalogue: { version: CATALOGUE.version, status: CATALOGUE.status, trialMonths: CATALOGUE.trial.months },
    costPerQuestion: { typical: costPerQuestion('typical'), worst: costPerQuestion('worst') },
    units: Object.keys(PLANS).flatMap((p) =>
      (['month', 'year'] as Interval[]).flatMap((iv) => sizes.flatMap((s) => (['typical', 'worst'] as Mode[]).map((m) => ({ plan: p, interval: iv, mode: m, ...unit(s, p, iv, m) })))),
    ),
    scenarios: (IN.scenarios.customers as number[]).flatMap((n) => (['typical', 'worst'] as Mode[]).map((m) => ({ mode: m, ...scenario(n, m) }))),
    fixed: fixedCosts(1, 12, 0),
    breakEven: { typical: breakEven('typical'), worst: breakEven('worst') },
    minSeats: Object.keys(PLANS).flatMap((p) =>
      CATALOGUE.regions.flatMap((r) =>
        (['month', 'year'] as Interval[]).map((iv) => {
          const rp = regionalPrice(r, p, iv);
          // A region without its own list pays the list price, converted by Paddle: already USD here.
          const fx = r.prices ? (IN.fx[rp.collect] ?? 1) : 1;
          return { plan: p, region: r.key, interval: iv, priceUsd: rp.amount / fx, collect: rp.collect, minSeats: minSeats(p, iv, rp.amount / fx, r.tax.b2b ? (r.tax.rate ?? 0) : 0) };
        }),
      ),
    ),
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`Inputs read on ${INPUTS_READ_ON} (scripts/quality/cost.inputs.json). Price list ${CATALOGUE.version} (${CATALOGUE.status}); trial ${CATALOGUE.trial.months} months.`);
    const usd4 = (n: number) => `$${n.toFixed(4)}`;
    console.log(`One model answer: ${usd4(out.costPerQuestion.typical)} typical (Sonnet ${pc(IN.ai.sonnetShare)}, answer cache ${pc(IN.ai.answerCacheHitShare)}), ${usd4(out.costPerQuestion.worst)} worst (all Sonnet, no cache).\n`);
    console.log('Unit cost per company a month (marginal; includes Paddle, support and the share of trials before it), on the list price:');
    console.log(`${'plan'.padEnd(10)}${'paid'.padEnd(7)}${'seats'.padStart(6)}${'revenue'.padStart(9)}${'cost typ'.padStart(10)}${'/seat'.padStart(8)}${'cost worst'.padStart(12)}${'/seat'.padStart(8)}${'margin worst'.padStart(14)}`);
    for (const p of Object.keys(PLANS))
      for (const iv of ['month', 'year'] as Interval[])
        for (const s of sizes) {
          const t = unit(s, p, iv, 'typical');
          const w = unit(s, p, iv, 'worst');
          console.log(`${p.padEnd(10)}${iv.padEnd(7)}${String(s).padStart(6)}${usd(t.revenue).padStart(9)}${usd(t.cost).padStart(10)}${usd(t.perSeat).padStart(8)}${usd(w.cost).padStart(12)}${usd(w.perSeat).padStart(8)}${pc(w.margin).padStart(14)}`);
        }
    console.log(`\nScenarios: N paying customers in the team mix (${sizes.join(' / ')} seats), ${plan} ${interval === 'month' ? 'monthly' : 'yearly'}, fixed costs included:`);
    console.log(`${'customers'.padEnd(10)}${'seats'.padStart(7)}${'revenue'.padStart(10)}${'fixed'.padStart(8)}${'variable'.padStart(10)}${'per company'.padStart(13)}${'per seat'.padStart(10)}${'profit'.padStart(9)}${'worst profit'.padStart(14)}`);
    for (const n of IN.scenarios.customers as number[]) {
      const t = scenario(n, 'typical');
      const w = scenario(n, 'worst');
      console.log(`${String(n).padEnd(10)}${String(Math.round(t.seats)).padStart(7)}${usd(t.revenue).padStart(10)}${usd(t.fixed).padStart(8)}${usd(t.variable).padStart(10)}${usd(t.perCompany).padStart(13)}${usd(t.perSeat).padStart(10)}${usd(t.profit).padStart(9)}${usd(w.profit).padStart(14)}`);
    }
    const f = fixedCosts(1, 12, 0);
    console.log(`\nFixed a month: ${Object.entries(f.lines).map(([k, v]) => `${k} ${usd(v)}`).join(' · ')} = ${usd(f.total)} (AI team at its cap; PITR on).`);
    console.log(`Break-even (${plan}, ${interval === 'month' ? 'monthly' : 'yearly'}, team mix): ${out.breakEven.typical} customers typical, ${out.breakEven.worst} at the caps.`);
    for (const sz of sizes) {
      const need = (m: Mode) => Math.ceil(f.total / Math.max(0.01, unit(sz, plan, interval, m).contribution));
      console.log(`  with companies of ${sz} seats only: ${need('typical')} typical, ${need('worst')} at the caps`);
    }
    const w12 = unit(12, plan, interval, 'worst');
    console.log(`\nWhere a 12-seat ${plan} company's worst case goes: ${Object.entries(w12.lines).map(([k, v]) => `${k} ${usd(v)}`).join(' · ')} · trials ${usd(w12.trial)}`);
    const big = scenario(300, 'worst');
    const aiAtCaps = big.seats * (PLANS[plan].caps.aiQuestionsPerSeat ?? 0) * costPerQuestion('worst');
    console.log(`AI at the caps for 300 customers: ${usd(aiAtCaps)} a month. The install-wide assistant cap (ASSISTANT_GLOBAL_MONTHLY_USD, $100 by default) stops it first: raise it as customers grow.`);
    console.log('\nFewest full seats for a company not to lose money at the caps, by region (tax as Paddle charges it):');
    for (const r of out.minSeats) console.log(`  ${r.plan.padEnd(9)}${r.region.padEnd(8)}${r.interval.padEnd(7)}${(`${usd(r.priceUsd)}/seat (${r.collect})`).padEnd(22)}${r.minSeats ?? 'never'}`);
  }
}
