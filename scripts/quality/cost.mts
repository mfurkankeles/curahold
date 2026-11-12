// The cost model: what one paid seat costs to run for a month, and the gross
// margin that leaves on each plan.
//
//   npx tsx scripts/quality/cost.mts            the table
//   npx tsx scripts/quality/cost.mts 1000       one size, line by line
//
// cost per seat = usage (USE) × list prices (PRICE). The prices were read on the
// date below from each provider's own pricing page; check them again before a
// decision that depends on them. Each usage figure says whether it was MEASURED
// (and where) or is still an ASSUMPTION waiting for the load test.
import { PLANS } from '../../shared/src/billing';

export const PRICES_READ_ON = '2026-11-12';

export const PRICE = {
  // Cloudflare Workers Paid — developers.cloudflare.com/workers/platform/pricing
  workers: { monthly: 5, requestsIncluded: 10e6, perMillionRequests: 0.3, cpuMsIncluded: 30e6, perMillionCpuMs: 0.02 },
  // Durable Objects (the live channel, not built yet) — developers.cloudflare.com/durable-objects/platform/pricing
  // An incoming WebSocket message counts as 1/20 of a request; a sleeping (hibernating) object costs no duration.
  durable: { requestsIncluded: 1e6, perMillionRequests: 0.15, gbSecondsIncluded: 400_000, perMillionGbSeconds: 12.5 },
  // R2 (attachments) — developers.cloudflare.com/r2/pricing. Sending files out is free.
  r2: { gbIncluded: 10, perGbMonth: 0.015, writesIncluded: 1e6, perMillionWrites: 4.5, readsIncluded: 10e6, perMillionReads: 0.36 },
  // Supabase Pro (Postgres, EU) — supabase.com/docs/guides/platform. The plan's $10 credit covers the smallest machine.
  supabase: { plan: 25, credit: 10, machine: { micro: 10, small: 15, medium: 60, large: 110 }, gbIncluded: 8, perGb: 0.125, pitr7Days: 100 },
  // Resend (mail) — resend.com/pricing. The free plan stops at 100 a day.
  resend: [
    { upTo: 3_000, monthly: 0 },
    { upTo: 50_000, monthly: 20 },
    { upTo: 100_000, monthly: 35 },
    { upTo: 200_000, monthly: 160 },
    { upTo: 500_000, monthly: 350 },
  ],
  // Paddle (sells as merchant of record) — paddle.com: a share of every charge plus a fixed part.
  paddle: { share: 0.05, perCharge: 0.5 },
  // Two domains a year (the app and the customer portal).
  domains: 2.5,
};

export const USE = {
  workDays: 21,
  // MEASURED (scripts/quality/browser.mts load): opening the app makes 19 requests, 15 of them to the API.
  apiCallsPerOpen: 15,
  // ASSUMPTION: a person opens or changes page 25 times a day and writes 40 things (tasks, comments, moves).
  opensPerDay: 25,
  writesPerDay: 40,
  // MEASURED in the code (web/src/lib/live.ts): one "anything new?" request every 30 s while the tab is in
  // front, every 90 s when untouched for 3 minutes. ASSUMPTION: 3 hours in front and 3 untouched, a day.
  pollsPerDay: 3 * 120 + 3 * 40,
  // ASSUMPTION until measured on Workers: processor time per request (Cloudflare's own average is 2.2 ms).
  cpuMsPerRequest: 8,
  // MEASURED (scripts/perf.ts database): 422 MB for a busy company of 306 people after a long time: 1.4 MB a seat.
  dbMbPerSeat: 1.4,
  // ASSUMPTION: a third of the people get their notices by mail (no chat app connected), about two a working
  // day, plus sign-in links and the weekly summary for everyone.
  mailsPerSeat: 0.33 * 2 * 21 + 6,
  // ASSUMPTION: attachments kept per seat after a year, and files written and read per month.
  fileGbPerSeat: 0.2,
  fileWritesPerSeat: 20,
  fileReadsPerSeat: 100,
  // People who cost something and pay nothing: free view-only seats (ASSUMPTION: one for every four paid
  // seats, a fifth as active) and companies on their 14-day trial (ASSUMPTION: 8% on top of paid seats).
  viewersPerSeat: 0.25,
  viewerActivity: 0.2,
  trialShare: 0.08,
  // ASSUMPTION: an average company pays for 12 seats (one charge a month, or one a year).
  seatsPerCompany: 12,
  // With a live channel: each person holds one connection, each change wakes the company's object once.
  liveConnectsPerDay: 6,
  liveWakeSeconds: 0.2,
  liveObjectGb: 0.128,
};

export interface Options {
  /** The live channel instead of asking every 30 seconds. */
  live?: boolean;
  /** Point-in-time recovery (seven days) on the database. */
  pitr?: boolean;
}

const over = (used: number, included: number) => Math.max(0, used - included);

export function monthlyCost(seats: number, opt: Options = {}) {
  const u = USE;
  // Everyone who makes the servers work, counted in "full seats' worth of activity".
  const active = seats * (1 + u.viewersPerSeat * u.viewerActivity + u.trialShare);
  const polls = opt.live ? 0 : u.pollsPerDay;
  const requests = active * u.workDays * (u.opensPerDay * u.apiCallsPerOpen + u.writesPerDay + polls);
  const p = PRICE;
  const workers = p.workers.monthly + (over(requests, p.workers.requestsIncluded) / 1e6) * p.workers.perMillionRequests + (over(requests * u.cpuMsPerRequest, p.workers.cpuMsIncluded) / 1e6) * p.workers.perMillionCpuMs;
  let live = 0;
  if (opt.live) {
    const wakes = active * u.workDays * (u.writesPerDay + u.liveConnectsPerDay);
    live = (over(wakes, p.durable.requestsIncluded) / 1e6) * p.durable.perMillionRequests + (over(wakes * u.liveWakeSeconds * u.liveObjectGb, p.durable.gbSecondsIncluded) / 1e6) * p.durable.perMillionGbSeconds;
  }
  const dbGb = (seats * (1 + u.trialShare) * u.dbMbPerSeat) / 1024;
  // The machine grows with the company count; PITR needs at least the small one.
  const machine = seats > 4000 ? 'large' : seats > 1500 ? 'medium' : seats > 300 || opt.pitr ? 'small' : 'micro';
  const database = p.supabase.plan + Math.max(0, p.supabase.machine[machine] - p.supabase.credit) + over(dbGb, p.supabase.gbIncluded) * p.supabase.perGb + (opt.pitr ? p.supabase.pitr7Days : 0);
  const mails = seats * (1 + u.trialShare) * u.mailsPerSeat;
  const mail = (p.resend.find((t) => mails <= t.upTo) ?? p.resend[p.resend.length - 1]).monthly;
  const files = over(seats * u.fileGbPerSeat, p.r2.gbIncluded) * p.r2.perGbMonth + (over(seats * u.fileWritesPerSeat, p.r2.writesIncluded) / 1e6) * p.r2.perMillionWrites + (over(seats * u.fileReadsPerSeat, p.r2.readsIncluded) / 1e6) * p.r2.perMillionReads;
  const lines = { workers, live, database, mail, files, domains: p.domains };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { seats, requests, dbGb, mails, machine, lines, total, perSeat: total / seats };
}

/** What is left of a seat's price after Paddle and the servers. */
export function margin(seats: number, price: number, yearly: boolean, opt: Options = {}) {
  const infra = monthlyCost(seats, opt).perSeat;
  // One charge per company: monthly, or once a year for twelve months of seats.
  const months = yearly ? 12 : 1;
  const paddle = price * PRICE.paddle.share + PRICE.paddle.perCharge / (USE.seatsPerCompany * months);
  return { infra, paddle, margin: (price - infra - paddle) / price };
}

if (process.argv[1]?.endsWith('cost.mts')) {
  const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
  const one = Number(process.argv[2]);
  if (one) {
    for (const [label, opt] of [['today (asks every 30 s)', {}], ['with the live channel', { live: true }], ['live channel + point-in-time recovery', { live: true, pitr: true }]] as const) {
      const c = monthlyCost(one, opt);
      console.log(`\n${one} paid seats, ${label}: ${usd(c.total)} a month = ${usd(c.perSeat)} a seat`);
      console.log(`  ${(c.requests / 1e6).toFixed(1)} M requests, database ${c.dbGb.toFixed(1)} GB on a ${c.machine} machine, ${Math.round(c.mails)} mails`);
      console.log(`  ${Object.entries(c.lines).map(([k, v]) => `${k} ${usd(v)}`).join(' · ')}`);
    }
  } else {
    const team = PLANS.team.price;
    console.log(`Prices read on ${PRICES_READ_ON}. Cost of one paid seat for a month, and gross margin on the cheapest plan (Team: $${team.month} monthly, $${team.year} a month billed yearly).\n`);
    console.log(`${'paid seats'.padEnd(12)}${'today'.padStart(10)}${'live'.padStart(10)}${'live+PITR'.padStart(11)}   ${'margin today'.padStart(13)}${'yearly'.padStart(9)}   ${'margin live+PITR'.padStart(17)}${'yearly'.padStart(9)}`);
    for (const seats of [50, 200, 1000, 5000]) {
      const pc = (n: number) => `${(n * 100).toFixed(1)}%`;
      const a = monthlyCost(seats).perSeat;
      const b = monthlyCost(seats, { live: true }).perSeat;
      const c = monthlyCost(seats, { live: true, pitr: true }).perSeat;
      console.log(
        `${String(seats).padEnd(12)}${usd(a).padStart(10)}${usd(b).padStart(10)}${usd(c).padStart(11)}   ${pc(margin(seats, team.month, false).margin).padStart(13)}${pc(margin(seats, team.year, true).margin).padStart(9)}   ${pc(margin(seats, team.month, false, { live: true, pitr: true }).margin).padStart(17)}${pc(margin(seats, team.year, true, { live: true, pitr: true }).margin).padStart(9)}`,
      );
    }
    const m = margin(1000, team.year, true);
    console.log(`\nAt 1,000 seats on the yearly Team plan: servers ${usd(m.infra)} + Paddle ${usd(m.paddle)} of $${team.year} a seat.`);
  }
}
